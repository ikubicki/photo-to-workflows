client<llm> ReasoningModel {
  provider "openai-generic"
  options {
    base_url env.LM_STUDIO_URL
    model "openai/gpt-oss-20b"
    temperature 0.5
  }
}
