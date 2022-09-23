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
    const { user, origin, requestId, method, body, time, pathSegments, pathOptions, url, query } = await env.CTX.fetch(req).then(res => res.json())
    if (!user.profile) return Response.redirect('https://gpt.do/login')
    const options = {
      model: 'code-davinci-002',
      prompt: '// ES6 arrow function called ' + pathSegments[0],
      temperature: 0,
      max_tokens: 300,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    }
    const completion = await fetch('https://api.openai.com/v1/completions', { method: 'post', body: JSON.stringify(options), headers:{ 'content-type': 'application/json', 'authorization': 'Bearer ' + env.OPENAI_API_KEY }}).then(res => res.json())
    const codeLines = completions.choices.map(choice => choice.text.split('/n'))
    return new Response(JSON.stringify({ api, options, completion, codeLines, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
  },
}
