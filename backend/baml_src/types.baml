// Using string literal union instead of enum to preserve lowercase serialization
// matching fixtures/types.ts Decision enum values
type Decision = "approved" | "rejected" | "change_requested" | "pending" | "completed"

class Participant {
  name string @description("Display name of the participant")
  id string? @description("UUID of matched contact — omit if no match found")
  role "approver" | "reviewer" | "readonly" @description("Defaults to approver if unclear from diagram")
  decision Decision? @description("Participant's decision, defaults to pending")
}

class StageDependency {
  parentStageId string @description("ID/name of the parent stage this depends on")
  condition "decision" | "deadline" | "completion" @description("Type of dependency trigger")
  decision Decision? @description("Required when condition is decision")
  deadline string? @description("ISO 8601 date string, required when condition is deadline")
}

class Stage {
  name string @description("Name of the approval stage")
  participants Participant[] @description("People involved in this stage")
  dependsOn StageDependency[]? @description("Dependencies on other stages")
  deadline string? @description("ISO 8601 deadline for the stage")
  decision Decision? @description("Overall stage decision, defaults to pending")
  metadata map<string, string>? @description("Optional key-value metadata")
}

class Workflow {
  name string @description("Name of the approval workflow")
  stages Stage[] @description("Ordered list of workflow stages")
  metadata map<string, string>? @description("Optional key-value metadata")
  decision Decision? @description("Overall workflow decision, defaults to pending")
}
