package mcpserver

func attemptCompletionToolDefinition() ToolDefinition {
	return ToolDefinition{
		Name:        "attempt_completion",
		Description: "Mark the current task as complete and return the final result text for the assistant to present to the user. Required argument: result.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"result": map[string]any{
					"type":        "string",
					"description": "Final completion result text for the task.",
				},
			},
			"required":             []string{"result"},
			"additionalProperties": false,
		},
	}
}

func (c *Catalog) callAttemptCompletion(arguments map[string]any) (any, error) {
	if err := validateAllowedArguments(arguments, "result"); err != nil {
		return nil, err
	}
	if _, err := requireStringArgumentAllowEmpty(arguments, "result"); err != nil {
		return nil, err
	}
	return map[string]any{
		"status": "completed",
		"result": "Done",
	}, nil
}