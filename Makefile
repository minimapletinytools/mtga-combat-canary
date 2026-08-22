.PHONY: build run test

build:
	pnpm build

run: build
	pnpm --filter @mtgatricks/desktop start

test:
	pnpm test
