set -ex
pnpm run build

rm gobra.so

tree-sitter build

