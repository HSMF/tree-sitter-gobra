set -ex
pnpm run build

rm gobra.so

tree-sitter build

cp ./gobra.so ~/.config/nvim/parser/
cp ./queries/highlights.scm ~/.config/nvim/queries/gobra/
