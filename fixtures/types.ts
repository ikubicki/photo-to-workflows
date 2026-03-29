export enum Decision {
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CHANGE_REQUESTED = 'change_requested',
    PENDING = 'pending',
    COMPLETED = 'completed',
}

export type Participant = {
    // display name
    name: string,
    // id of the matched contact (omitted if no match found)
    id?: string,
    // defaults to 'approver' if not provided
    role: 'approver' | 'reviewer' | 'readonly',
    // decision of the participant, defaults to 'pending'
    decision?: Decision,
}

export type StageDependency = {
    // ID of the parent stage that this stage depends on
    parentStageId: string,
    // condition for the dependency, defaults to 'completion'
    condition:
    // when stage is completed with specific decision
    | 'decision'
    // on a specific deadline regardless of the stage decision
    | 'deadline'
    // when the stage is completed regardless of the decision
    | 'completion',
    decision?: Decision, // required if condition is 'decision'
    deadline?: Date, // required if condition is 'deadline'
}

export type Stage = {
    // name of the stage
    name: string,
    // list of participants in the stage
    participants: Participant[],
    // IDs of parent stages
    dependsOn?: StageDependency[],
    // optional deadline for the stage
    deadline?: Date,
    // stage decision, defaults to 'pending'
    decision?: Decision,
    // optional metadata for the stage
    metadata?: Record<string, any>,
}

export type Workflow = {
    // name of the workflow
    name: string,
    // list of stages in the workflow
    stages: Stage[],
    // optional metadata for the workflow
    metadata?: Record<string, any>,
    // workflow decision, defaults to 'pending'
    decision?: Decision,
}

export type Contact = {
    // unique identifier for the contact (could be email or an ID from a contacts database)
    id: string,
    // display name of the contact - combined first and last name or a full name string
    name: string,
    // email address of the contact
    email: string,
    // position or role of the contact in the organization (e.g., 'Software Engineer', 'Product Manager')
    position: string,
}