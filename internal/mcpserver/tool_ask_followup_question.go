package mcpserver

import (
	"encoding/xml"
	"fmt"
	"strings"
)

type askFollowupQuestionPayload struct {
	Suggestions []askFollowupQuestionSuggestion `xml:"suggest"`
}

type askFollowupQuestionSuggestion struct {
	Text string `xml:",chardata"`
}

func askFollowupQuestionToolDefinition() ToolDefinition {
	return ToolDefinition{
		Name:        "ask_followup_question",
		Description: "Ask the user a follow-up question and wait for their answer before continuing the task. Required arguments: question, follow_up. The follow_up field must contain 2 to 4 <suggest>...</suggest> entries.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"question": map[string]any{
					"type":        "string",
					"description": "A clear follow-up question for the user.",
				},
				"follow_up": map[string]any{
					"type":        "string",
					"description": "XML suggestion list payload containing one or more suggest elements.",
				},
			},
			"required":             []string{"question", "follow_up"},
			"additionalProperties": false,
		},
	}
}

func (c *Catalog) callAskFollowupQuestion(arguments map[string]any) (any, error) {
	if err := validateAllowedArguments(arguments, "question", "follow_up"); err != nil {
		return nil, err
	}
	question, err := requireStringArgument(arguments, "question")
	if err != nil {
		return nil, err
	}
	followUp, err := requireStringArgument(arguments, "follow_up")
	if err != nil {
		return nil, err
	}
	suggestions, err := parseAskFollowupSuggestions(followUp)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"status":      "pending",
		"question":    question,
		"suggestions": suggestions,
	}, nil
}

func parseAskFollowupSuggestions(raw string) ([]string, error) {
	payload := strings.TrimSpace(raw)
	if payload == "" {
		return nil, fmt.Errorf("argument follow_up must not be empty")
	}
	if !strings.HasPrefix(payload, "<follow_up") {
		payload = "<follow_up>" + payload + "</follow_up>"
	}
	var parsed askFollowupQuestionPayload
	if err := xml.Unmarshal([]byte(payload), &parsed); err != nil {
		return nil, fmt.Errorf("argument follow_up must be valid XML: %w", err)
	}
	suggestions := make([]string, 0, len(parsed.Suggestions))
	for _, item := range parsed.Suggestions {
		text := strings.TrimSpace(item.Text)
		if text == "" {
			continue
		}
		suggestions = append(suggestions, text)
	}
	if len(suggestions) < 2 || len(suggestions) > 4 {
		return nil, fmt.Errorf("argument follow_up must contain 2 to 4 suggest entries")
	}
	return suggestions, nil
}
