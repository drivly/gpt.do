import { API, json, requiresAuth } from 'apis.do'
import OpenAI from 'openai'
import webhooks from './github-webhooks.js'
import { assistant, thread, run, message } from './openai.js'

const api = new API(
  {
    icon: '🤖',
    name: 'gpt.do',
    description: 'GPT-3 Templates and Completions',
    url: 'https://gpt.do/api',
    type: 'https://apis.do/ai',
    site: 'https://gpt.do',
    login: 'https://gpt.do/login',
    signup: 'https://gpt.do/signup',
    subscribe: 'https://gpt.do/subscribe',
    repo: 'https://github.com/drivly/gpt.do',
  },
  {
    examples: {
      get: '/:message',
      post: '/post',
    },
  }
)

api.get('/favicon.ico', () => {
  return new Response(null, { status: 404 })
})

api.get('/assistants', requiresAuth, async (_req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const assistants = await openai.beta.assistants.list()
  return assistants
})
api.get('/assistants/:assistantId', requiresAuth, async (req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const { assistantId } = req.params
  return await assistant({ assistantId, openai, ...req.query })
})
api.createRoute('POST', '/assistants/:assistantId', requiresAuth, async (req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const { assistantId } = req.params
  return await assistant({ assistantId, openai, ...req.ctx.json })
})
api.get('/threads/:threadId', requiresAuth, async (req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const { threadId } = req.params
  const data = await thread({ threadId, openai })
  const endpoints = {
    thread: new URL(`threads/${data.id}`, 'https://gpt.do'),
    messages: new URL(`threads/${data.id}/messages`, 'https://gpt.do'),
  }
  return { endpoints, data }
})
api.get('/threads/:threadId/messages', requiresAuth, async (req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const { threadId } = req.params
  const messages = await openai.beta.threads.messages.list(threadId)
  const endpoints = {
    thread: new URL(`threads/${threadId}`, 'https://gpt.do'),
    messages: new URL(`threads/${threadId}/messages`, 'https://gpt.do'),
  }
  return { endpoints, ...messages }
})
api.get('/threads/:threadId/run/:runId?', requiresAuth, async (req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const { threadId, runId } = req.params
  const { assistant: assistant_id, instructions } = req.query
  return await run({ runId, openai, threadId, assistant_id, instructions })
})
api.get('/threads/:threadId/messages/new/:message', requiresAuth, async (req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const { threadId, message: content } = req.params
  return await message({ openai, threadId, content: decodeURIComponent(content) })
})
api.get('/threads/:threadId/messages/:messageId', requiresAuth, async (req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return await message({ openai, ...req.params })
})
api.createRoute('POST', '/threads/:threadId', requiresAuth, async (req, env) => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const { threadId } = req.params
  const { message: content } = req.ctx.json
  return await message({ openai, threadId, content })
})

api.get('/webhooks/github', webhooks)
api.get('/:message?', requiresAuth, handler)
api.get('/:template/:templateId/:message?', requiresAuth, handler)
api.createRoute('POST', '/api/:message', requiresAuth, handler)
api.createRoute('POST', '/post', requiresAuth, handler)
api.createRoute('POST', '/:template/:templateId/:message?', requiresAuth, handler)

async function handler({ user, ctx: { json: data, hostname, pathSegments, query } }, env) {
  async function getCompletion(options) {
    return await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      body: JSON.stringify(options),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + env.OPENAI_API_KEY,
      },
    })
      .then((res) => res.json())
      .catch(console.error)
  }
  let { messages, functions } = data || {}
  let { n, max_tokens, model, store } = query || {}
  if (!n) n = data?.n
  if (!max_tokens) max_tokens = data?.max_tokens
  if (!model) model = data?.model
  if (!store) store = data?.store
  if (!messages) messages = []
  let steps = [],
    input = { ...query }
  if (['prompts', 'formats'].includes(pathSegments[0])) {
    const [{ value: templates }, { value: file }] = await Promise.allSettled([
      fetch('https://gpt.do/templates.json').then((res) => res.json()),
      query.fileUrl ? fetch(decodeURIComponent(query.fileUrl)).then((res) => res.text()) : '',
    ])
    const template = templates[pathSegments[0]][pathSegments[1]]
    if (!template) return json({ api, error: 'Template not found.', user }, 404)
    if (!n) n = template.n
    if (!max_tokens) max_tokens = template.max_tokens
    if (!model) model = template.model
    if (!messages?.length) messages = template.messages || formatMessages(template.list) || []
    input = { ...template.input, ...query, file }
    if (template.forEach?.length) steps = Array.isArray(template.forEach[0]) ? template.forEach.map(formatMessages) : [formatMessages(template.forEach)]
  }
  if (model && functions?.length && /03\d\d$/.test(model)) {
    return json({ api, error: model + ' does not support functions.', user }, 400)
  }
  if (n) n = parseInt(n)
  if (max_tokens) {
    max_tokens = parseInt(max_tokens)
    if (user.role !== 'admin' && max_tokens > 1000) max_tokens = 1000
  }
  const id = user.id && env.CONVO.idFromName(hostname + user.id.toString())
  const stub = user.id && env.CONVO.get(id)
  if (stub && store && !messages?.length) messages = await stub.fetch(new Request('/'))
  if ((pathSegments.length === 1 && pathSegments[0]) || (pathSegments.length === 3 && pathSegments[2])) {
    input.item = decodeURIComponent(pathSegments[pathSegments.length - 1])
    if (!messages.find((m) => m.role === 'user')) {
      messages.push({ role: 'user', content: input.item })
    }
  }
  if (input.file && !messages.find(m.content.match(/\{\{file\}\}/))) {
    messages.push({ role: 'user', content: input.file })
  }
  if (!messages.find((m) => m.role === 'system')) {
    messages.unshift({
      role: 'system',
      content: query.system || data?.system || 'You are a helpful assistant who responds in Markdown. All lists should be Markdown checklists with `- [ ]` items.',
    })
  }
  if (Object.keys(input).length) messages = fillMessageTemplate(messages, input)
  const options = {
    model: model && (!model.startsWith('gpt-4') || user.role === 'admin') ? model : 'gpt-3.5-turbo',
    messages,
    n,
    max_tokens,
    functions: functions?.length ? functions : undefined,
    user: data?.user || undefined,
  }
  const completion = await getCompletion(options)
  if (completion.error) {
    console.error(completion.error)
    return json(
      {
        api,
        error: 'An error occurred while processing your request.',
        data: query.debug
          ? {
              completion,
              functions,
              inputMessages: [[messages]],
            }
          : undefined,
        user,
      },
      500
    )
  }
  let message = completion.choices?.[0]?.message
  let response = message?.content?.split('\n') || []
  let responses = []
  for (let stepIX = 0; stepIX < steps.length; stepIX++) {
    const step = steps[stepIX]
    const inputForks = (stepIX === 0 ? response : responses[stepIX - 1].flatMap((r) => r.response))
      .map((r) => r?.replace(/^- "?(.+?)"?$/, '$1')?.trim()) // remove markdown list formatting
      .filter((r) => r)
    const promises = []
    responses[stepIX] = []
    for (let forkIX = 0; forkIX < inputForks.length; forkIX++) {
      responses[stepIX][forkIX] = {
        inputMessages: fillMessageTemplate(step, {
          ...input,
          item: inputForks[forkIX],
        }),
      }
      promises.push(
        getCompletion({
          ...options,
          messages: responses[stepIX][forkIX].inputMessages,
        }).then((c) => {
          responses[stepIX][forkIX].completion = c
          responses[stepIX][forkIX].response = c.choices?.[0]?.message?.content?.split('\n') || []
        })
      )
    }
    await Promise.allSettled(promises)
  }
  if (store) {
    await env.CONVO.fetch(
      id,
      new Request('/', {
        body: messages.concat(message),
      })
    )
  }
  return {
    response: responses.length ? responses[responses.length - 1].flatMap((r) => r.response) : response,
    ...(responses.length === 0 ? completion : {}),
    completions: responses.length ? [[completion]].concat(responses.map((r) => r.map((r) => r.completion))) : undefined,
    functions: query.debug ? functions : undefined,
    inputMessages: query.debug ? [[messages]].concat(responses.map((r) => r.map((r) => r.inputMessages))) : undefined,
  }
}

function fillMessageTemplate(messages, input) {
  return messages.map((message) => ({
    role: message.role,
    name: message.name,
    content: message.content.replace(/\{\{([^}]+)\}\}/g, (_, key) => input[key]),
  }))
}

function formatMessages(messageSet) {
  return messageSet.map(Object.entries).map((i) => ({
    role: i[0][0],
    content: i[0][1],
  }))
}

export class Conversation {
  constructor(state) {
    this.state = state
    state.blockConcurrencyWhile(async () => {
      this.messages = await this.state.storage.get('messages')
    })
  }

  async fetch(request) {
    let { messages } = await request.json()
    if (messages?.length) await this.state.storage.set('messages', (this.messages = messages))
    return new Response(this.messages)
  }
}

export default {
  fetch: async (req, env, ctx) => {
    return await api.fetch(req, env, ctx)
  },
}
