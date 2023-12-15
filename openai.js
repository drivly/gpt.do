import OpenAI from 'openai'

/**
 * @param {{ runId?: string|null, openai: OpenAI, threadId: string, assistant_id: string, instructions?: string|null }} options
 */
export async function run({ runId, openai, threadId, assistant_id, instructions }) {
  const run =
    !runId || runId === 'new'
      ? await openai.beta.threads.runs.create(threadId, {
          assistant_id,
          instructions,
        })
      : await openai.beta.threads.runs.retrieve(threadId, runId)

  return run
}

/**
 * @param {{ threadId?: string|null, openai: OpenAI }} options
 */
export async function thread({ threadId, openai }) {
  const thread = !threadId || threadId === 'new' ? await openai.beta.threads.create() : await openai.beta.threads.retrieve(threadId)
  return thread
}

/**
 * @param {{ messageId?: string|null, threadId: string, openai: OpenAI, content?: string }} options
 */
export async function message({ messageId, openai, threadId, content }) {
  const message =
    !messageId || messageId === 'new'
      ? await openai.beta.threads.messages.create(threadId, {
          content,
          role: 'user',
        })
      : await openai.beta.threads.messages.retrieve(threadId, messageId)
  return message
}

/**
 * @param {{ assistantId?: string|null, openai: OpenAI, name?: string, instructions?: string, model?: string|null }} options
 */
export async function assistant({ assistantId, openai, name, instructions, model }) {
  const assistant =
    !assistantId || assistantId === 'new'
      ? await openai.beta.assistants.create({
          name,
          instructions,
          model: model || 'gpt-3.5-turbo',
        })
      : await openai.beta.assistants.retrieve(assistantId)
  return assistant
}
