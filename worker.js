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
    const { user, json: data, pathname, pathSegments, query, } = await env.CTX.fetch(req).then(res => res.json())
    if (pathname == '/favicon.ico') return new Response(null, { status: 404 })
    if (pathname == '/webhooks/github') return json({ success: true, user })
    if (!user.authenticated) return Response.redirect('https://gpt.do/login')
    let { messages, functions, n, max_tokens, model, } = data || {}
    if (!n) n = query.n
    if (!max_tokens) max_tokens = query.max_tokens
    if (!model) model = query.model
    let forEach = [], input = { ...query }, file
    if (['prompts', 'formats'].includes(pathSegments[0])) {
      const templates = await fetch('https://gpt.do/templates.json').then(res => res.json())
      const template = templates[pathSegments[0]][pathSegments[1]]
      if (!template) return json({ error: 'Template not found.' }, 404)
      if (!model) model = template.model
      if (!messages?.length) messages = template.messages || formatMessages(template.list) || []
      if (query.fileUrl) {
        file = await fetch(decodeURIComponent(query.fileUrl)).then(res => res.text())
      }
      input = { ...template.input, ...query, file, }
      if (Object.keys(input).length) messages = fillMessageTemplate(messages, input)
      if (template.forEach?.length) forEach = Array.isArray(template.forEach[0]) ? template.forEach.map(formatMessages) : [formatMessages(template.forEach)]
    }
    if (!file && query.fileUrl) {
      file = await fetch(decodeURIComponent(query.fileUrl)).then(res => res.text())
      input.file = file
    }
    if (!messages) messages = []
    if (file && !messages.find(m => m.role === 'user')) messages.push({ role: 'user', content: file })
    if (!messages.length && pathSegments[0]) messages = [
      { role: 'user', content: pathSegments[0].replace('_', ' ').replace('+', ' ') },
    ]
    if (!messages.find(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: query.system || data?.system || 'You are a helpful assistant who responds in Markdown.  All lists should be Markdown checklists with `- [ ]` items.', })
    }
    const options = {
      model: user.role === 'admin' && model ? model : 'gpt-3.5-turbo',
      messages,
      n,
      max_tokens: max_tokens ? parseInt(max_tokens) : undefined,
      functions,
      user: data?.user || undefined,
    }
    const completion = await fetch('https://api.openai.com/v1/chat/completions', { method: 'post', body: JSON.stringify(options), headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + env.OPENAI_API_KEY } }).then(res => res.json())
    if (completion.error) {
      console.error(completion.error)
      return json({
        error: "An error occurred while processing your request.",
        messages: query.debug && user.role === 'admin' ? [messages] : undefined,
        completion: query.debug && user.role === 'admin' ? completion : undefined,
      }, 500)
    }
    let response = completion.choices?.[0]?.message?.content?.split('\n')
    let completions = []
    let responses = []
    let inputMessages = []
    for (let i = 0; i < forEach.length; i++) {
      forEach[i].items = i === 0 ? [response] : responses[i - 1]
      completions[i] = forEach[i].items.map(() => null)
      responses[i] = forEach[i].items.map(() => null)
      inputMessages[i] = forEach[i].items.map(() => null)
      const promises = []
      for (let fork of forEach[i].items)
        for (let j = 0; j < fork.length; j++) {
          inputMessages[i][j] = fillMessageTemplate(forEach[i], {
            ...input,
            item: fork[j].replace(/(^[\- \[\]"\\]*|"$)/g, '')
          })
          promises.push(fetch('https://api.openai.com/v1/chat/completions', {
            method: 'post', body: JSON.stringify({
              ...options,
              messages: inputMessages[i][j]
            }), headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + env.OPENAI_API_KEY }
          }).then(res => res.json()).then(c => {
            completions[i][j] = c
            responses[i][j] = c.error ? [] : c.choices?.[0]?.message?.content?.split('\n')
          }))
        }
      await Promise.all(promises)
    }

    return json({
      response: responses.length === 0 ? response : response.concat(responses.flatMap(s => s.flatMap(i => i))),
      ...(completions.length === 0 ? completion : {}),
      completions: completions.length === 0 ? undefined : [completion].concat(completions.flatMap(s => s.flatMap(i => i))),
      inputMessages: query.debug && user.role === 'admin' ? [messages].concat(inputMessages) : undefined,
      user,
    })
  },
}

const json = (obj, status) => new Response(JSON.stringify(obj, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }, status, })

function fillMessageTemplate(messages, input) {
  return messages.map(message => ({
    ...message,
    content: message.content.replace(/\{\{([^}]+)\}\}/g, (_, key) => input[key]),
  }))
}

function formatMessages(forEach) {
  return forEach
    .map(Object.entries).map(i => ({
      role: i[0][0],
      content: i[0][1],
    }))
}
