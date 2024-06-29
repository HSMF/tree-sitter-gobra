package tree_sitter_gobra_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-gobra"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_gobra.Language())
	if language == nil {
		t.Errorf("Error loading Gobra grammar")
	}
}
