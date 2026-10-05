import assert from "node:assert/strict";
import test from "node:test";

import {
  validateDependabotText,
  validateDependencyReviewText,
  validateHostedSiteDeployWorkflowText,
  validateManifestCoverage,
  validateMiseWorkflowText,
  validateNpmConfigText,
  validateNpmWorkspace,
  validateReleaseWorkflowText,
  validateRepository,
  validateUsesText,
} from "./validate-supply-chain.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function lineEndingValidators(validator) {
  return ["\n", "\r\n"].map((newline) => (text) =>
    validator(text.replaceAll("\r\n", "\n").replaceAll("\n", newline)),
  );
}

test("accepts immutable actions with release provenance and local actions", () => {
  for (const validate of lineEndingValidators(validateUsesText)) {
    assert.deepEqual(
      validate(`steps:\n  - uses: actions/checkout@${SHA} # v7.0.0\n  - uses: ./local`),
      [],
    );
  }
});

test("rejects mutable, short, uncommented, container, and remote workflow references", () => {
  for (const reference of [
    "actions/checkout@v7 # v7.0.0",
    "actions/checkout@0123456 # v7.0.0",
    `actions/checkout@${SHA}`,
    "docker://example/image:latest",
    "owner/repo/.github/workflows/ci.yml@main # v1.0.0",
  ]) {
    for (const validate of lineEndingValidators(validateUsesText)) {
      assert.ok(validate(`steps:\n  - uses: ${reference}\n`).length > 0, reference);
    }
  }
});

test("new dependency manifests require an explicit maintenance policy entry", () => {
  const policy = {
    ecosystems: [{ manifest_globs: ["Cargo.toml", "crates/*/Cargo.toml"] }],
  };
  assert.deepEqual(validateManifestCoverage(["Cargo.toml", "crates/core/Cargo.toml"], policy), []);
  assert.match(validateManifestCoverage(["package.json"], policy)[0], /no maintenance policy/);
});

test("Dependabot routine groups are weekly, bounded, and exclude security and major updates", () => {
  const valid = `version: 2
updates:
  - package-ecosystem: cargo
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      routine:
        applies-to: version-updates
        update-types:
          - minor
          - patch
  - package-ecosystem: github-actions
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      routine:
        applies-to: version-updates
        update-types:
          - minor
          - patch
  - package-ecosystem: npm
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      routine:
        applies-to: version-updates
        update-types:
          - minor
          - patch
`;
  for (const validate of lineEndingValidators(validateDependabotText)) {
    assert.deepEqual(validate(valid), []);
    assert.ok(validate(valid.replace("interval: weekly", "interval: monthly")).length);
    assert.ok(validate(valid.replace("- patch", "- major")).length);
    assert.ok(validate(valid.replace("applies-to: version-updates", "applies-to: security-updates")).length);
  }
});

test("npm policy requires exact workspace pins, one root lock, and lock agreement", () => {
  const manifests = {
    "package.json": { private: true, workspaces: ["apps/desktop", "apps/hosted"] },
    "apps/desktop/package.json": { private: true, devDependencies: { vitest: "4.1.10" } },
    "apps/hosted/package.json": { private: true, dependencies: { worker: "1.2.3" } },
  };
  const lock = {
    packages: {
      "": {},
      "apps/desktop": { devDependencies: { vitest: "4.1.10" } },
      "apps/hosted": { dependencies: { worker: "1.2.3" } },
    },
  };
  assert.deepEqual(validateNpmWorkspace(manifests, ["package-lock.json"], lock), []);
  assert.ok(validateNpmWorkspace(manifests, ["apps/hosted/package-lock.json"], lock).length);
  assert.ok(validateNpmWorkspace({
    ...manifests,
    "apps/desktop/package.json": { devDependencies: { vitest: "^4.1.10" } },
  }, ["package-lock.json"], lock).length);
  assert.ok(
    validateNpmWorkspace({
      ...manifests,
      "package.json": {
        ...manifests["package.json"],
        allowScripts: { "workerd@1.2.3": true },
      },
    }, ["package-lock.json"], lock).some((error) => error.includes("without duplicating")),
  );
});

test("npm configuration preserves exact pins during automated updates", () => {
  const valid = "save-exact=true\nstrict-allow-scripts=true\n";
  for (const validate of lineEndingValidators(validateNpmConfigText)) {
    assert.deepEqual(validate(valid), []);
    assert.match(validate(valid.replace("save-exact=true", "save-exact=false"))[0], /save exact/);
    assert.match(
      validate(valid.replace("strict-allow-scripts=true", "strict-allow-scripts=false"))[0],
      /fail closed/,
    );
  }
});

test("dependency review is pull-request-only and blocks moderate additions", () => {
  const valid = `name: Dependency review
on:
  pull_request:
permissions:
  contents: read
jobs:
  review:
    steps:
      - uses: actions/dependency-review-action@${SHA} # v5.0.0
        with:
          fail-on-severity: moderate
`;
  for (const validate of lineEndingValidators(validateDependencyReviewText)) {
    assert.deepEqual(validate(valid), []);
    assert.ok(validate(valid.replace("pull_request:", "push:")).length);
    assert.ok(validate(valid.replace("pull_request:\n", "pull_request:\n  push:\n")).length);
    assert.ok(validate(valid.replace("moderate", "high")).length);
  }
});

test("Mise action provenance and exact release pins accept LF and Windows CRLF", () => {
  const valid = `      - name: Set up mise
        uses: jdx/mise-action@${SHA} # v4.2.3
        with:
          version: 2026.7.6
          github_token: \${{ github.token }}
`;
  for (const newline of ["\n", "\r\n"]) {
    const workflow = valid.replaceAll("\n", newline);
    assert.deepEqual(validateMiseWorkflowText(workflow), [], JSON.stringify(newline));
    for (const version of ["latest", "2026.7", "^2026.7.6", "2026.7.6-rc.1", "2026.7.6.1", ""]) {
      assert.match(
        validateMiseWorkflowText(workflow.replace("version: 2026.7.6", `version: ${version}`))[0],
        /exact reviewed release/,
        `${JSON.stringify(newline)} ${version}`,
      );
    }
    for (const reference of [
      "jdx/mise-action@v4.2.3 # v4.2.3",
      "jdx/mise-action@0123456 # v4.2.3",
      `jdx/mise-action@${SHA}`,
      `jdx/mise-action@${SHA} # latest`,
    ]) {
      assert.match(
        validateMiseWorkflowText(workflow.replace(`jdx/mise-action@${SHA} # v4.2.3`, reference))[0],
        /exact reviewed release/,
        `${JSON.stringify(newline)} ${reference}`,
      );
    }
  }
});

test("release workflow validator pins unsigned policy, provenance, and the mutation boundary", () => {
  const valid = `name: release
on:
  push:
    tags:
      - "v*"
permissions:
  contents: read
jobs:
  macos:
    needs: build
    steps:
      - run: mise run desktop:publication-prepare
      - run: mise run desktop:release-stage -- app arm --trust-mode unsigned-macos
  assemble:
    needs: [macos, windows]
    steps:
      - run: mise run desktop:release-assemble -- arm intel --require-publishable
  attest:
    permissions:
      contents: read
      id-token: write
      attestations: write
    steps:
      - uses: actions/attest@${SHA} # v4.1.1
  publish:
    permissions:
      contents: write
    steps:
      - run: mise run desktop:publication-notes -- tag notes --release-dir target/desktop-release/publishable/complete
      - run: mise run desktop:publication-publish-draft
  verify:
    steps:
      - run: mise run desktop:publication-verify-draft
`;
  for (const validate of lineEndingValidators(validateReleaseWorkflowText)) {
    assert.deepEqual(validate(valid), []);
    assert.ok(validate(valid.replace("    needs: build", "    environment: desktop-release\n    needs: build")).length);
    assert.ok(validate(valid.replace("  assemble:\n", "  leak:\n    run: echo ${{ secrets.UNRELATED_SECRET }}\n  assemble:\n")).length);
    assert.ok(validate(valid.replace("--trust-mode unsigned-macos", "--trust-mode release")).length);
    assert.ok(validate(valid.replace("publication-prepare", "publication-sign")).length);
    assert.ok(validate(valid.replace("needs: [macos, windows]", "needs: windows")).length);
    assert.ok(validate(valid.replace("--release-dir target/desktop-release/publishable/complete", "")).length);
    assert.ok(validate(valid.replace("  assemble:\n", "  assemble:\n    permissions:\n      contents: write\n")).length);
    assert.ok(validate(valid.replace("  macos:\n", "  macos:\n    permissions:\n      id-token: write\n")).length);
    assert.ok(validate(valid.replace("  attest:\n", "  misplaced_provenance:\n")).length);
    assert.ok(validate(valid.replace("  publish:\n", "  misplaced_mutation:\n")).length);
    assert.ok(validate(valid.replace("  push:\n", "  pull_request:\n")).length);
    assert.ok(validate(valid.replace("  push:\n", "  pull_request:\n  push:\n")).length);
    assert.ok(validate(valid.replace("publication-publish-draft", "gh release publish")).length);
  }
});

test("hosted site deployment verifies selected main history and refreshes published downloads", () => {
  const valid = `name: site
on:
  push:
    branches: [main]
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      source_revision:
        required: true
permissions:
  contents: read
jobs:
  deploy:
    environment:
      name: production
    env:
      SOURCE_REVISION: \${{ github.event_name == 'workflow_dispatch' && inputs.source_revision || github.event_name == 'release' && 'refs/heads/main' || github.sha }}
    steps:
      - uses: actions/checkout@${SHA} # v7.0.0
        with:
          ref: \${{ env.SOURCE_REVISION }}
      - run: |
          if [[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" && ! "$SOURCE_REVISION" =~ ^[0-9a-f]{40}$ ]]; then
            exit 1
          fi
          checked_out_source=$(git rev-parse HEAD)
          git merge-base --is-ancestor "$checked_out_source" origin/main
      - run: mise run hosted:test
      - name: Deploy static site
        run: npm run deploy:site --workspace @antennabench/hosted
        env:
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
`;
  for (const validate of lineEndingValidators(validateHostedSiteDeployWorkflowText)) {
    assert.deepEqual(validate(valid), []);
    assert.ok(validate(valid.replace("branches: [main]", "branches: [feature]")).length);
    assert.ok(validate(valid.replace("  push:\n", "  pull_request:\n  push:\n")).length);
    assert.ok(validate(valid.replace("origin/main", "HEAD^")).length);
    assert.ok(validate(valid.replace("$checked_out_source\" origin/main", "$GITHUB_SHA\" origin/main")).length);
    assert.ok(validate(valid.replace("git rev-parse HEAD", "git rev-parse origin/main")).length);
    assert.ok(validate(valid.replace("types: [published]", "types: [created]")).length);
    assert.ok(validate(valid.replace("'refs/heads/main'", "github.sha")).length);
    assert.ok(validate(valid.replace("env.SOURCE_REVISION", "github.sha")).length);
    assert.ok(validate(valid.replace("^[0-9a-f]{40}$", "^[0-9a-f]{7}$")).length);
    assert.ok(validate(valid.replace('if [[ "$GITHUB_EVENT_NAME" == "workflow_dispatch"', 'if [[ "$GITHUB_EVENT_NAME" == "push"')).length);
    assert.ok(validate(valid.replace("- name: Deploy static site", "- run: echo ${{ secrets.CLOUDFLARE_API_TOKEN }}\n      - name: Deploy static site")).length);
  }
});

test("the repository satisfies its supply-chain convention", () => {
  assert.deepEqual(validateRepository(process.cwd()), []);
});
