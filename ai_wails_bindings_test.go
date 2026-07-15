package main

import (
	"encoding/json"
	ai "luminssh-go/internal/ai"
	"testing"
	"time"
)

func saveAIProviderStateForTest(t *testing.T, bindings *AIBindings, state ai.AIProviderState) {
	t.Helper()
	data, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err := bindings.SaveAIProviderState(string(data)); err != nil {
		t.Fatal(err)
	}
}

func TestSaveAIProviderStateBumpsSnapshotOnlyForProviderChanges(t *testing.T) {
	cm := testSyncManager(t)
	bindings := NewAIBindings(&App{configManager: cm})
	provider := ai.AIProviderProfile{
		ID:        "provider-1",
		Name:      "供应商一",
		Provider:  "openai",
		Model:     "model-1",
		UpdatedAt: 1,
	}

	saveAIProviderStateForTest(t, bindings, ai.AIProviderState{Providers: []ai.AIProviderProfile{provider}})
	persisted := bindings.GetAIProviderState()
	for _, item := range persisted.Providers {
		if item.ID == provider.ID {
			provider = item
			break
		}
	}
	addedAt := cm.loadSnapshotTime()
	if addedAt == 0 {
		t.Fatal("新增供应商后必须更新快照时间")
	}

	time.Sleep(2 * time.Millisecond)
	saveAIProviderStateForTest(t, bindings, ai.AIProviderState{
		CurrentProviderID: provider.ID,
		Providers:         []ai.AIProviderProfile{provider},
	})
	if got := cm.loadSnapshotTime(); got != addedAt {
		t.Fatalf("仅切换当前供应商不应触发同步：原时间=%d，新时间=%d", addedAt, got)
	}

	provider.Name = "供应商一（已编辑）"
	provider.UpdatedAt = 2
	time.Sleep(2 * time.Millisecond)
	saveAIProviderStateForTest(t, bindings, ai.AIProviderState{
		CurrentProviderID: provider.ID,
		Providers:         []ai.AIProviderProfile{provider},
	})
	editedAt := cm.loadSnapshotTime()
	if editedAt <= addedAt {
		t.Fatalf("编辑供应商后必须更新快照时间：新增=%d，编辑=%d", addedAt, editedAt)
	}

	time.Sleep(2 * time.Millisecond)
	saveAIProviderStateForTest(t, bindings, ai.AIProviderState{Providers: []ai.AIProviderProfile{}})
	if deletedAt := cm.loadSnapshotTime(); deletedAt <= editedAt {
		t.Fatalf("删除供应商后必须更新快照时间：编辑=%d，删除=%d", editedAt, deletedAt)
	}
}
