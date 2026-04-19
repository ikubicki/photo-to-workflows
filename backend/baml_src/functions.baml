function ExtractWorkflow(imageDescription: string, contacts: string, instructions: string) -> Workflow {
  client ReasoningModel
  prompt #"
    {{ _.role("system") }}
    {{ instructions }}

    Contacts list:
    {{ contacts }}

    {{ ctx.output_format }}

    {{ _.role("user") }}
    Here is the workflow diagram description:
    {{ imageDescription }}
  "#
}
