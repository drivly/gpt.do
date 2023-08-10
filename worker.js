export const api = {
  icon: '🤖',
  name: 'gpt.do',
  description: 'GPT-3 Templates and Completions',
  url: 'https://gpt.do/api',
  type: 'https://apis.do/ai',
  endpoints: {
    get: 'https://gpt.do/:message',
    post: 'https://gpt.do/api',
  },
  site: 'https://gpt.do',
  login: 'https://gpt.do/login',
  signup: 'https://gpt.do/signup',
  subscribe: 'https://gpt.do/subscribe',
  repo: 'https://github.com/drivly/gpt.do',
}

export default {
  fetch: async (req, env) => {
    async function getCompletion(options) {
      return await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'post',
        body: JSON.stringify(options),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + env.OPENAI_API_KEY
        }
      }).then(res => res.json()).catch(() => ({}))
    }
    const { user, json: data, pathname, pathSegments, query, } = await env.CTX.fetch(req).then(res => res.json())
    if (pathname == '/favicon.ico') return new Response(null, { status: 404 })
    // TODO: Complete stub for GitHub webhook
    if (pathname == '/webhooks/github') return json({ success: true, user })
    if (!user.authenticated) return Response.redirect('https://gpt.do/login')
    let { messages, functions, } = data || {}
    let { n, max_tokens, model, } = query || {}
    if (!n) n = data?.n
    if (!max_tokens) max_tokens = data?.max_tokens
    if (!model) model = data?.model
    let steps = [], input = { ...query }
    if (['prompts', 'formats'].includes(pathSegments[0])) {
      const [{ value: templates }, { value: file }] = await Promise.allSettled([
        fetch('https://gpt.do/templates.json').then(res => res.json()),
        query.fileUrl ? fetch(decodeURIComponent(query.fileUrl)).then(res => res.text()) : '',
      ])
      const template = templates[pathSegments[0]][pathSegments[1]]
      if (!template) return json({ api, error: 'Template not found.', user, }, 404)
      if (!n) n = template.n
      if (!max_tokens) max_tokens = template.max_tokens
      if (!model) model = template.model
      if (!messages?.length) messages = template.messages || formatMessages(template.list) || []
      input = { ...template.input, ...query, file, }
      if (template.forEach?.length)
        steps = Array.isArray(template.forEach[0])
          ? template.forEach.map(formatMessages)
          : [formatMessages(template.forEach)]
    }
    if (n) n = parseInt(n)
    if (max_tokens) {
      max_tokens = parseInt(max_tokens)
      if (user.role !== 'admin' && max_tokens > 1000) max_tokens = 1000
    }
    if (!messages) messages = []
    if (input.file && !messages.find(m => m.role === 'user')) {
      messages.push({ role: 'user', content: input.file })
    }
    if (pathSegments.length === 1 && pathSegments[0] || pathSegments.length === 3 && pathSegments[2]) {
      input.item = decodeURIComponent(pathSegments[pathSegments.length - 1])
      if (!messages.find(m => m.role === 'user'))
        messages.push({ role: 'user', content: input.item })
    }
    if (!messages.find(m => m.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: query.system || data?.system
          || 'You are a helpful assistant who responds in Markdown. All lists should be Markdown checklists with `- [ ]` items.',
      })
    }
    if (Object.keys(input).length) messages = fillMessageTemplate(messages, input)
    const options = {
      model: model && (!model.startsWith('gpt-4') || user.role === 'admin') ? model : 'gpt-3.5-turbo',
      messages,
      n,
      max_tokens,
      functions,
      user: data?.user || undefined,
    }
    const completion = await getCompletion(options)
    if (completion.error) {
      console.error(completion.error)
      return json({
        api,
        error: "An error occurred while processing your request.",
        completion: query.debug ? completion : undefined,
        functions: query.debug ? functions : undefined,
        inputMessages: query.debug ? [[messages]] : undefined,
        user,
      }, 500)
    }
    let response = completion.choices?.[0]?.message?.content?.split('\n') || []
    let responses = []
    for (let stepIX = 0; stepIX < steps.length; stepIX++) {
      const step = steps[stepIX]
      const inputForks = (stepIX === 0 ? response : responses[stepIX - 1].flatMap(r => r.response))
        .map(r => r.replace(/^- "?(.+?)"?$/, '$1').trim()) // remove markdown list formatting
        .filter(r => r)
      const promises = []
      responses[stepIX] = []
      for (let forkIX = 0; forkIX < inputForks.length; forkIX++) {
        responses[stepIX][forkIX] = {
          inputMessages: fillMessageTemplate(step, {
            ...input,
            item: inputForks[forkIX],
          })
        }
        promises.push(getCompletion({
          ...options,
          messages: responses[stepIX][forkIX].inputMessages,
        }).then(c => {
          responses[stepIX][forkIX].completion = c
          responses[stepIX][forkIX].response = c.choices?.[0]?.message?.content?.split('\n') || []
        }))
      }
      await Promise.allSettled(promises)
    }

    return json({
      response: responses.length
        ? responses[responses.length - 1].flatMap(r => r.response)
        : response,
      ...(responses.length === 0 ? completion : {}),
      completions: responses.length
        ? [[completion]].concat(responses.map(r => r.map(r => r.completion)))
        : undefined,
      functions: query.debug ? functions : undefined,
      inputMessages: query.debug
        ? [[messages]].concat(responses.map(r => r.map(r => r.inputMessages)))
        : undefined,
      user,
    })
  },
}

function fillMessageTemplate(messages, input) {
  return messages.map(message => ({
    role: message.role,
    name: message.name,
    content: message.content.replace(/\{\{([^}]+)\}\}/g, (_, key) => input[key]),
  }))
}

function formatMessages(messageSet) {
  return messageSet.map(Object.entries).map(i => ({
    role: i[0][0],
    content: i[0][1],
  }))
}

const json = (obj, status) =>
  new Response(JSON.stringify(obj, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  })
