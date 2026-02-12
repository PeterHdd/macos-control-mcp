#!/bin/bash
set -e

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh 0.0.4"
  exit 1
fi

# Update package.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

# Update src/index.ts
sed -i '' "s/version: \".*\"/version: \"$VERSION\"/" src/index.ts

# Build to verify
npm run build

# Commit, tag, push
git add package.json src/index.ts
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push && git push --tags

echo "Released v$VERSION — GitHub Action will publish to npm."
