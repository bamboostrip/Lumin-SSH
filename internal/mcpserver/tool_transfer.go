package mcpserver

import (
	"context"
	"fmt"
	"strings"
)

const (
	TransferOperationUpload   = "upload"
	TransferOperationDownload = "download"
)

type TransferBatchItem struct {
	LocalPath  string `json:"local_path"`
	RemotePath string `json:"remote_path"`
}

type TransferFileRequest struct {
	SessionID    string              `json:"session_id"`
	LocalParent  string              `json:"local_parent"`
	RemoteParent string              `json:"remote_parent"`
	Operation    string              `json:"operation"`
	Wait         bool                `json:"wait"`
	Items        []TransferBatchItem `json:"items"`
}

type TransferTaskSnapshot struct {
	TransferID     string              `json:"transfer_id"`
	SessionID      string              `json:"session_id"`
	Operation      string              `json:"operation"`
	Mode           string              `json:"mode"`
	DetectedKind   string              `json:"detected_kind"`
	Status         string              `json:"status"`
	Phase          string              `json:"phase,omitempty"`
	Progress       float64             `json:"progress"`
	BytesDone      int64               `json:"bytes_done,omitempty"`
	BytesTotal     int64               `json:"bytes_total,omitempty"`
	Current        string              `json:"current,omitempty"`
	Detail         string              `json:"detail,omitempty"`
	Error          string              `json:"error,omitempty"`
	Wait           bool                `json:"wait"`
	Active         bool                `json:"active"`
	LocalParent    string              `json:"local_parent"`
	RemoteParent   string              `json:"remote_parent"`
	Items          []TransferBatchItem `json:"items,omitempty"`
	ItemCount      int                 `json:"item_count"`
	CompletedItems int                 `json:"completed_items"`
	StartedAt      int64               `json:"started_at,omitempty"`
	FinishedAt     int64               `json:"finished_at,omitempty"`
	UpdatedAt      int64               `json:"updated_at,omitempty"`
}

type TransferBatchResult struct {
	SessionID string               `json:"session_id"`
	Wait      bool                 `json:"wait"`
	Transfer  TransferTaskSnapshot `json:"transfer"`
}

type TransferListResult struct {
	SessionID    string                 `json:"session_id"`
	ActiveCount  int                    `json:"active_count"`
	HistoryCount int                    `json:"history_count"`
	Transfers    []TransferTaskSnapshot `json:"transfers"`
}

type TransferProvider interface {
	TransferFile(sessionID string, request TransferFileRequest) (TransferTaskSnapshot, error)
	ListTransfers(sessionID string) ([]TransferTaskSnapshot, error)
}

type CancelableTransferProvider interface {
	TransferFileContext(ctx context.Context, sessionID string, request TransferFileRequest) (TransferTaskSnapshot, error)
	ListTransfersContext(ctx context.Context, sessionID string) ([]TransferTaskSnapshot, error)
}

func transferFileWithContext(provider TransferProvider, ctx context.Context, sessionID string, request TransferFileRequest) (TransferTaskSnapshot, error) {
	if provider == nil {
		return TransferTaskSnapshot{}, fmt.Errorf("transfer provider unavailable")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if cancelableProvider, ok := provider.(CancelableTransferProvider); ok {
		return cancelableProvider.TransferFileContext(ctx, sessionID, request)
	}
	select {
	case <-ctx.Done():
		return TransferTaskSnapshot{}, ctx.Err()
	default:
		return provider.TransferFile(sessionID, request)
	}
}

func listTransfersWithContext(provider TransferProvider, ctx context.Context, sessionID string) ([]TransferTaskSnapshot, error) {
	if provider == nil {
		return nil, fmt.Errorf("transfer provider unavailable")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if cancelableProvider, ok := provider.(CancelableTransferProvider); ok {
		return cancelableProvider.ListTransfersContext(ctx, sessionID)
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
		return provider.ListTransfers(sessionID)
	}
}

func normalizeTransferOperation(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case TransferOperationUpload:
		return TransferOperationUpload
	case TransferOperationDownload:
		return TransferOperationDownload
	default:
		return ""
	}
}

func transferBatchToolDefinition() ToolDefinition {
	return ToolDefinition{
		Name: "transfer_batch",
		Description: "Transfer an explicit batch of local and remote files or directories between the connected SSH session and the local machine. Required arguments: session_id, local_parent, remote_parent, operation, items. local_parent and remote_parent must be absolute parent directories. Each items entry contains local_path and remote_path relative to those parents. Any relative path that escapes its parent root is rejected. Only the listed batch items are transferred; unspecified siblings under the same parent are ignored. Runtime automatically detects whether each item is a file or directory. The implementation always forces the same decisive compression strategy that the file manager uses when its compressed-transfer switch is enabled: single files transfer directly, directories use compressed transfer. wait defaults to true and waits for all items in this batch task to finish.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"session_id": map[string]any{
					"type": "string",
					"description": "Connected SSH terminal session identifier returned by list_connected_sessions.",
				},
				"local_parent": map[string]any{
					"type": "string",
					"description": "Absolute local parent directory used as the base root for every items[].local_path entry.",
				},
				"remote_parent": map[string]any{
					"type": "string",
					"description": "Absolute remote parent directory used as the base root for every items[].remote_path entry.",
				},
				"operation": map[string]any{
					"type": "string",
					"description": "Transfer direction for the whole batch.",
					"enum": []string{TransferOperationUpload, TransferOperationDownload},
				},
				"wait": map[string]any{
					"type": "boolean",
					"description": "Whether to block until all batch items finish. Defaults to true.",
				},
				"items": map[string]any{
					"type": "array",
					"description": "Explicit batch item list. Only these items are transferred.",
					"items": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"local_path": map[string]any{
								"type": "string",
								"description": "Relative local file or directory path under local_parent.",
							},
							"remote_path": map[string]any{
								"type": "string",
								"description": "Relative remote file or directory path under remote_parent.",
							},
						},
						"required": []string{"local_path", "remote_path"},
						"additionalProperties": false,
					},
				},
			},
			"required": []string{"session_id", "local_parent", "remote_parent", "operation", "items"},
			"additionalProperties": false,
		},
	}
}

func transferListToolDefinition() ToolDefinition {
	return ToolDefinition{
		Name: "transfer_list",
		Description: "List current transfer tasks for a connected SSH terminal session, including active tasks and recent completed or failed in-memory history.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"session_id": map[string]any{
					"type": "string",
					"description": "Connected SSH terminal session identifier returned by list_connected_sessions.",
				},
			},
			"required": []string{"session_id"},
			"additionalProperties": false,
		},
	}
}

func parseTransferWait(arguments map[string]any) (bool, error) {
	rawValue, ok := arguments["wait"]
	if !ok {
		return true, nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return false, fmt.Errorf("argument wait must be a boolean")
	}
	return value, nil
}

func parseTransferBatchItems(arguments map[string]any) ([]TransferBatchItem, error) {
	rawValue, ok := arguments["items"]
	if !ok {
		return nil, fmt.Errorf("missing required argument: items")
	}
	rawItems, ok := rawValue.([]any)
	if !ok {
		return nil, fmt.Errorf("argument items must be an array")
	}
	items := make([]TransferBatchItem, 0, len(rawItems))
	for index, rawItem := range rawItems {
		itemMap, ok := rawItem.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("items[%d] must be an object", index)
		}
		localPath, err := requireStringArgument(itemMap, "local_path")
		if err != nil {
			return nil, fmt.Errorf("items[%d]: %w", index, err)
		}
		remotePath, err := requireStringArgument(itemMap, "remote_path")
		if err != nil {
			return nil, fmt.Errorf("items[%d]: %w", index, err)
		}
		items = append(items, TransferBatchItem{
			LocalPath:  localPath,
			RemotePath: remotePath,
		})
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("argument items must contain at least one entry")
	}
	return items, nil
}

func (c *Catalog) callTransferBatch(arguments map[string]any) (any, error) {
	if c == nil || c.service == nil {
		return nil, ErrSessionProviderUnavailable
	}
	if c.transferProvider == nil {
		return nil, fmt.Errorf("transfer provider unavailable")
	}
	if err := validateAllowedArguments(arguments, "session_id", "local_parent", "remote_parent", "operation", "wait", "items"); err != nil {
		return nil, err
	}
	session, err := requireSessionArgument(c.service, arguments)
	if err != nil {
		return nil, err
	}
	if !session.SFTPAvailable {
		return nil, fmt.Errorf("session does not have sftp available")
	}
	localParent, err := requireStringArgument(arguments, "local_parent")
	if err != nil {
		return nil, err
	}
	remoteParent, err := requireStringArgument(arguments, "remote_parent")
	if err != nil {
		return nil, err
	}
	operation, err := requireStringArgument(arguments, "operation")
	if err != nil {
		return nil, err
	}
	normalizedOperation := normalizeTransferOperation(operation)
	if normalizedOperation == "" {
		return nil, fmt.Errorf("argument operation must be one of: %s, %s", TransferOperationUpload, TransferOperationDownload)
	}
	wait, err := parseTransferWait(arguments)
	if err != nil {
		return nil, err
	}
	items, err := parseTransferBatchItems(arguments)
	if err != nil {
		return nil, err
	}
	request := TransferFileRequest{
		SessionID:    session.SessionID,
		LocalParent:  localParent,
		RemoteParent: remoteParent,
		Operation:    normalizedOperation,
		Wait:         wait,
		Items:        items,
	}
	snapshot, err := transferFileWithContext(c.transferProvider, c.callCtx, session.SessionID, request)
	if err != nil {
		return nil, err
	}
	return TransferBatchResult{
		SessionID: session.SessionID,
		Wait:      wait,
		Transfer:  snapshot,
	}, nil
}

func (c *Catalog) callTransferList(arguments map[string]any) (any, error) {
	if c == nil || c.service == nil {
		return nil, ErrSessionProviderUnavailable
	}
	if c.transferProvider == nil {
		return nil, fmt.Errorf("transfer provider unavailable")
	}
	if err := validateAllowedArguments(arguments, "session_id"); err != nil {
		return nil, err
	}
	session, err := requireSessionArgument(c.service, arguments)
	if err != nil {
		return nil, err
	}
	transfers, err := listTransfersWithContext(c.transferProvider, c.callCtx, session.SessionID)
	if err != nil {
		return nil, err
	}
	activeCount := 0
	historyCount := 0
	for _, item := range transfers {
		if item.Active {
			activeCount++
			continue
		}
		historyCount++
	}
	return TransferListResult{
		SessionID:    session.SessionID,
		ActiveCount:  activeCount,
		HistoryCount: historyCount,
		Transfers:    transfers,
	}, nil
}