import OpenAI from 'openai'

/**
 * @param {{ runId: string, openai: OpenAI, threadId: string, assistant_id: string, instructions?: string|null }} options
 */
export async function getOrCreateRun({ runId, openai, threadId, assistant_id, instructions }) {
  const run = runId
    ? await openai.beta.threads.runs.retrieve(threadId, runId)
    : await openai.beta.threads.runs.create(threadId, {
        assistant_id,
        instructions,
      })
  return run
}

/**
 * @param {{ threadId: string, openai: OpenAI }} options
 */
export async function getOrCreateThread({ threadId, openai }) {
  const thread = threadId === 'new' ? await openai.beta.threads.create() : await openai.beta.threads.retrieve(threadId)
  return thread
}

/**
 * @param {{ threadId: string, openai: OpenAI, content: string }} options
 */
export async function createMessage({ openai, threadId, content }) {
  const message = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content,
  })
  return message
}

/**
 * @param {{ assistantId: string, openai: OpenAI, name?: string, instructions?: string, model: string }} options
 */
export async function getAssistant({ assistantId, openai, name, instructions, model }) {
  const assistant =
    assistantId === 'new'
      ? await openai.beta.assistants.create({
          name,
          instructions,
          model: model || 'gpt-3.5-turbo',
        })
      : await openai.beta.assistants.retrieve(assistantId)
  return assistant
}
