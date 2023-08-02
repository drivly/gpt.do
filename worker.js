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
    const { user, json: data, pathname, pathSegments, query, }
      = await env.CTX.fetch(req).then(res => res.json())
    if (pathname == '/webhooks/github') {
      return json({ success: true, user })
    }
    if (!user.authenticated) return Response.redirect('https://gpt.do/login')
    let { messages, functions, n, max_tokens, model, } = data || {}
    let forEach = []
    if (['prompt', 'format'].includes(pathSegments[0])) {
      const templates = await fetch('https://gpt.do/templates.json').then(res => res.json())
      const template = templates[pathSegments[0]][pathSegments[1]]
      if (!template) return json({ error: 'Template not found.' }, 404)
      if (!model) model = template.model
      if (!messages?.length) messages = template.messages || formatMessages(template.list) || []
      let input = { ...template.input, ...query }
      console.log(JSON.stringify({ input }))
      if (Object.keys(input).length) {
        fillMessageTemplate(messages, input)
      }
      if (template.forEach?.length) {
        forEach = formatMessages(Array.isArray(template.forEach) ? template.forEach : [template.forEach])
        fillMessageTemplate(forEach, input)
      }
    }

    if (!messages?.length)
      messages = [
        { role: 'user', content: pathSegments[0].replace('_', ' ').replace('+', ' ') },
      ]
    if (!messages.find(m => m.role === 'system')) {
      const content = data?.system || 'You are a helpful assistant who responds in Markdown.  All lists should be Markdown checklists with `- [ ]` items.'
      messages.unshift({ role: 'system', content, })
    }
    const options = {
      model: user.role === 'admin' && model ? model : 'gpt-3.5-turbo',
      messages,
      n,
      max_tokens,
      functions,
      user: data?.user || undefined,
    }
    const completion = await fetch('https://api.openai.com/v1/chat/completions', { method: 'post', body: JSON.stringify(options), headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + env.OPENAI_API_KEY } }).then(res => res.json())
    if (completion.error) {
      console.error(completion.error)
      return json({ error: "An error occurred while processing your request." }, 500)
    }
    let response = completion.choices?.[0]?.message?.content?.split('\n')
    messages.push(completion.choices?.[0]?.message)

    for (let each of forEach) {
      messages.push(each)

      const completion = await fetch('https://api.openai.com/v1/chat/completions', { method: 'post', body: JSON.stringify(options), headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + env.OPENAI_API_KEY } }).then(res => res.json())
      if (completion.error) {
        console.error(completion.error)
        return json({ error: "An error occurred while processing your request." }, 500)
      }
      response = response.concat(completion.choices?.[0]?.message?.content?.split('\n'))
      messages.push(completion.choices?.[0]?.message)
    }

    return json({ response, ...completion, user })
  },
}

const json = (obj, status) => new Response(JSON.stringify(obj, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }, status, })

function fillMessageTemplate(messages, input) {
  for (let message of messages) {
    if (message.content) {
      message.content = message.content.replace(/\{\{([^}]+)\}\}/g, (_, key) => input[key])
    }
  }
}

function formatMessages(forEach) {
  return forEach
    .map(Object.entries).map(i => ({
      role: i[0][0],
      content: i[0][1],
    }))
}

