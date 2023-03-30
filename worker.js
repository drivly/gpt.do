export const api = {
  icon: '🤖',
  name: 'gpt.do',
  description: 'GPT-3 Templates and Completions',
  url: 'https://gpt.do/api',
  type: 'https://apis.do/ai',
  endpoints: {
    list: 'https://gpt.do/list',
    get: 'https://gpt.do/:id',
  },
  site: 'https://gpt.do',
  login: 'https://gpt.do/login',
  signup: 'https://gpt.do/signup',
  subscribe: 'https://gpt.do/subscribe',
  repo: 'https://github.com/drivly/gpt.do',
}

export default {
  fetch: async (req, env) => {
    const { user, origin, requestId, method, body, time, pathname, pathSegments, pathOptions, url, query } = await env.CTX.fetch(req).then(res => res.json())
    if (pathname == '/webhooks/github') {
      return json({ success: true, user })
    }
    if (!user.authenticated) return Response.redirect('https://gpt.do/login')
    const options = {
      // model: 'gpt-4',
      model: 'gpt-3.5-turbo',
      messages: [
        {'role': 'system', 'content': 'You are a helpful assistant who responds in Markdown.  All lists should be Markdown checklists with `- [ ]` items.'},
        {'role': 'user', 'content': pathSegments[0].replace('_',' ').replace('+',' ') },
    ]
    }
    const completion = await fetch('https://api.openai.com/v1/chat/completions', { method: 'post', body: JSON.stringify(options), headers:{ 'content-type': 'application/json', 'authorization': 'Bearer ' + env.OPENAI_API_KEY }}).then(res => res.json())
    const response = completion.choices[0].message.content.split('\n')
    return json({response, ...completion, user})
    // return new Response(JSON.stringify({ api, options, completion, codeLines, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
  },
}

const json = obj => new Response(JSON.stringify(obj, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
