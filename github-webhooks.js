// TODO: Complete stub for GitHub webhook
export default ({ ctx: { json } }, _env) => {
  console.log({ json })
  return { success: true }
}
