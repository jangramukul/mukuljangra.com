---
title: Android CI/CD Guide
layout: post
sequence: 136
categories: post
tags:
  - CI/CD
  - Gradle
  - Android
---

A good CI/CD pipeline catches bugs before they reach users, enforces quality gates, and automates the tedious parts of releasing. For Android, this means building, testing, linting, and signing — all automatically on every PR and merge. When your CI is set up right, bad code simply can't ship. When it's set up wrong — or not at all — you're relying on humans to remember every check, every time, and humans forget.

The first time I set up CI for an Android project, I underestimated how different it is from backend CI. Android builds are slow — a clean build on a mid-size project runs 6-10 minutes. Emulator tests are flaky by default. Signing requires managing keystores securely. And Gradle's caching behavior can either save you 70% of build time or silently give you stale artifacts. This guide covers the patterns I've landed on after iterating through a lot of broken pipelines.

## GitHub Actions for Android

GitHub Actions is where most Android teams start — it's integrated with your repository, free for public repos, and has enough community actions to handle Android-specific needs. The workflow files live in `.github/workflows/` and are YAML-based.

```yaml
# .github/workflows/ci.yml
name: Android CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: ${{ github.ref != 'refs/heads/main' }}

      - name: Build debug APK
        run: ./gradlew assembleDebug --no-daemon

      - name: Run unit tests
        run: ./gradlew testDebugUnitTest --no-daemon
```

The `gradle/actions/setup-gradle` action handles Gradle caching automatically — it caches the Gradle wrapper, dependencies, and build outputs between runs. The `cache-read-only` flag is important: PR branches read from the cache but don't write to it, so only main branch builds populate the cache. Without this, I've seen cache sizes balloon to 2GB+ because every feature branch was overwriting the shared cache with its own build outputs.

The `--no-daemon` flag matters in CI. Gradle's daemon is designed for interactive development — it stays alive between builds to avoid JVM startup costs. In CI, each build runs in a fresh container, so the daemon starts up, runs once, and gets killed. Keeping it alive wastes memory. For the JDK, use `zulu` or `temurin` distributions — Zulu is what Google recommends for Android development. JDK 17 is the minimum for AGP 8.x projects.

## PR Quality Gates

Running everything sequentially — build, lint, test — wastes time. If lint catches a formatting issue in 30 seconds, there's no reason to wait 8 minutes for the full build to finish first. The pattern I use is fail-fast ordering: run the cheapest checks first, then progressively more expensive ones. In GitHub Actions, this means splitting the pipeline into parallel jobs with dependencies.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
      - name: Run lint
        run: ./gradlew lintDebug --no-daemon
      - name: Upload lint report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: lint-report
          path: '**/build/reports/lint-results-debug.html'

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
      - name: Run unit tests
        run: ./gradlew testDebugUnitTest --no-daemon
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: '**/build/test-results/testDebugUnitTest/'

  build:
    needs: [lint, unit-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
      - name: Build debug APK
        run: ./gradlew assembleDebug --no-daemon
```

Lint and unit tests run in parallel. The build job only starts if both pass. The `if: always()` on the test results upload ensures you get the XML reports even when tests fail — which you need for PR status checks.

Here's a pattern I learned the hard way: set your CI to also run `./gradlew dependencies --write-locks` and fail if the lockfile changes. This catches accidental dependency upgrades that sneak in through transitive resolution. A teammate once bumped OkHttp from 4.11 to 4.12 through a Retrofit version change, and the connection pooling behavior difference caused intermittent production timeouts. A lockfile check would have flagged that in the PR.

For branch protection, configure GitHub to require these jobs to pass before merging. Go to Settings → Branches → Branch protection rules → Require status checks. This makes the pipeline an actual gate, not just an informational signal.

## Instrumented Tests in CI

Unit tests run on the JVM and are fast. Instrumented tests — Espresso, Compose UI tests, anything that needs an Android framework — need either an emulator or a real device. This is where CI gets painful for Android. You have three options, and each comes with real tradeoffs.

**Emulator in CI with `reactivecircus/android-emulator-runner`.** This is the most common approach for open-source projects. The action boots an Android emulator on the CI runner, waits for it to be ready, and runs your instrumented tests on it.

```yaml
  instrumented-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        api-level: [30, 34]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666"' \
            | sudo tee /etc/udev/rules.d/99-kvm.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm

      - name: Run instrumented tests
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: ${{ matrix.api-level }}
          arch: x86_64
          emulator-options: -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim
          disable-animations: true
          script: ./gradlew connectedDebugAndroidTest
```

The KVM step is critical — without hardware acceleration, the emulator runs in software emulation mode and is roughly 10x slower. GitHub's `ubuntu-latest` runners support KVM, but you need to enable it explicitly. The emulator options disable everything visual because there's nothing to display on a headless CI server.

The tradeoff with CI emulators is reliability. In my experience, about 5-10% of CI runs flake due to emulator boot timeouts or crashes mid-test. Running with `-no-snapshot` and adding retry logic helps, but you'll never get it to 100%.

**Firebase Test Lab.** Google's cloud testing service runs your tests on real physical devices in their data center. It's more reliable than CI emulators because the infrastructure is purpose-built for Android testing. The tradeoff is cost — free for 15 tests per day on virtual devices, but any real project burns through that in a single PR.

**My recommendation:** run Espresso and Compose UI tests on CI emulators for PRs, and use Firebase Test Lab for nightly runs across multiple API levels and device form factors. This gives you fast PR feedback without the cost of running every test on cloud devices, while still getting broad device coverage on a daily cadence.

## Code Signing and Release

The release pipeline is where CI/CD pays off the most — and where the most things can go wrong. You absolutely cannot check a keystore file into version control. The standard pattern is to base64-encode the keystore and store it as a GitHub Secret.

```bash
# Encode the keystore
base64 -i release-keystore.jks | pbcopy
# Paste this value into GitHub Secrets as KEYSTORE_BASE64
```

Then in the workflow, decode it back into a file before building:

```yaml
  release:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4

      - name: Decode keystore
        run: |
          echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > app/release-keystore.jks

      - name: Build signed AAB
        run: ./gradlew bundleRelease --no-daemon
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}

      - name: Upload to Play Store
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: com.example.app
          releaseFiles: app/build/outputs/bundle/release/app-release.aab
          track: internal
```

Your `build.gradle.kts` reads the signing config from environment variables:

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file("release-keystore.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KEY_ALIAS")
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}
```

I want to stress something that bit me hard: never use `System.getenv()` with fallback to `local.properties` in the same signing config. I've seen setups where the build falls back to a debug keystore when environment variables aren't set, and a debug-signed AAB ended up on the Play Store internal track. It took two days to figure out why testers were getting a different signing certificate. If the environment variable is missing, the build should fail loudly.

## Gradle Build Cache in CI

Gradle's local build cache stores task outputs on disk and reuses them when inputs haven't changed. But in CI, every build starts with a clean workspace. The remote build cache solves this by storing cached outputs in a shared location that all CI builds can read from.

The `gradle/actions/setup-gradle` action caches the Gradle home directory between runs using GitHub's cache. But this is not the same as Gradle's build cache — it caches individual task outputs (compiled classes, lint results), while the GitHub Actions cache covers the wrapper and dependencies. Both matter, and they're complementary.

For the Gradle build cache, you have two options. **Develocity (formerly Gradle Enterprise)** provides a managed remote build cache with build scans and predictive test selection. It costs money, but for large teams the savings justify it — in one project, enabling Develocity dropped CI build times from 9 minutes to 3.5 minutes because most tasks were cache hits.

**Self-hosted cache** is the budget alternative. You run a simple HTTP server (`gradle/build-cache-node` Docker image) that stores cached artifacts. I've seen teams run this on a small EC2 instance and it works fine for teams under 10 developers. Beyond that, cache hit rates degrade from concurrent writes and eviction pressure.

```properties
# gradle.properties
org.gradle.caching=true
```

```kotlin
// settings.gradle.kts
buildCache {
    local {
        isEnabled = true
    }
    remote<HttpBuildCache> {
        url = uri("https://cache.yourcompany.com/cache/")
        isPush = System.getenv("CI") != null
        credentials {
            username = System.getenv("CACHE_USERNAME") ?: ""
            password = System.getenv("CACHE_PASSWORD") ?: ""
        }
    }
}
```

The `isPush` flag is set to `true` only in CI — developer machines read from the cache but don't write to it, keeping the cache populated with deterministic CI-produced outputs.

One gotcha that took me a while to debug: Gradle's build cache keys include absolute file paths by default. If your CI checks out to `/home/runner/work/project` and your teammate's machine uses `/Users/name/projects/project`, the cache keys won't match even for identical source code. The fix is to enable path normalization in Gradle:

```kotlin
// settings.gradle.kts
normalization {
    runtimeClasspath {
        metaInf {
            ignoreCompletely()
        }
    }
}
```

## Pipeline Design Patterns

Not every branch needs the same pipeline. Running instrumented tests on every PR commit wastes CI minutes and blocks developers waiting for 20-minute test suites. The pattern I use has four tiers, each running progressively more checks.

**Feature branches (PR).** Run lint, unit tests, and debug build. This is the fast feedback loop — it should complete in under 5 minutes. Block merging if any of these fail. Don't run instrumented tests here unless the PR explicitly touches UI code (you can use path filters in GitHub Actions to trigger conditional jobs).

```yaml
on:
  pull_request:
    paths:
      - 'app/src/**'
      - 'feature/**'
      - '*.gradle.kts'
      - 'gradle/**'
```

**Main branch (post-merge).** Run the full unit test suite, instrumented tests on a single API level, and build the release AAB. Upload to the Play Store internal track automatically. This is the integration gate — it catches any issues that slipped through the PR pipeline due to merge conflicts or test interactions.

**Release branch.** Run everything: full unit tests, instrumented tests on multiple API levels (matrix of API 28, 30, 34), and build both debug and release variants. Only if everything passes, sign the production AAB and upload to the Play Store. This pipeline can take 30-45 minutes and that's fine — releases don't happen every hour.

**Nightly builds.** Run the slow tests you don't want blocking PRs: full instrumented suite across 4-5 API levels, Firebase Test Lab on physical devices, slow integration tests against staging APIs. If nightly builds fail, create an issue automatically.

```yaml
on:
  schedule:
    - cron: '0 3 * * 1-5'  # 3 AM UTC, weekdays only

jobs:
  full-device-matrix:
    strategy:
      fail-fast: false
      matrix:
        api-level: [28, 30, 33, 34]
    runs-on: ubuntu-latest
    steps:
      # ... emulator setup and test steps

  create-issue-on-failure:
    needs: [full-device-matrix]
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Nightly build failed: ${context.runId}`,
              body: `[View run](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`,
              labels: ['ci-failure']
            })
```

The `fail-fast: false` in the matrix strategy is deliberate. By default, GitHub Actions cancels all matrix jobs when one fails. For nightly builds, you want to know which specific API levels failed — API 28 might have a compatibility issue that doesn't affect API 34. Canceling the other jobs hides useful information.

Here's my reframe moment with CI/CD: the pipeline isn't just about catching bugs. It's about removing decisions. When the pipeline is set up correctly, developers don't decide whether to run tests — CI does. They don't decide which variant to build for release — CI does. They don't decide how to sign the APK — CI does. Every manual step you automate is a step that can't be forgotten, skipped under time pressure, or done differently by different team members. IMO, the best CI/CD pipeline is one that your team never has to think about.

## Quiz

**Question 1:** A team stores their signing keystore file directly in the Git repository (encrypted with a simple password) and decrypts it during CI. What's wrong with this approach?

**Wrong:** Nothing — as long as the password is strong, encrypting the keystore in the repo is fine.

**Correct:** If the repository is ever leaked, forked publicly, or the Git history is exposed, the encrypted keystore goes with it. Brute-forcing a simple password on a leaked file is trivial. Keystores should never be in version control — store them as base64-encoded GitHub Secrets or use a dedicated secrets manager. The encryption password itself becomes another secret to manage, doubling the attack surface for no benefit.

**Question 2:** A CI pipeline runs lint, unit tests, and instrumented tests sequentially in a single job. The instrumented tests take 15 minutes. A developer pushes a commit with a lint error. How long before they know?

**Wrong:** They'll know as soon as lint fails, since lint runs first in the job.

**Correct:** They'll know after lint fails, but the answer depends on your setup. In a single sequential job, lint might finish in 2 minutes and the developer gets feedback quickly. But the real problem is that the entire 15-minute instrumented test step was allocated and waiting. In a multi-job pipeline with lint as a separate job, the instrumented test job wouldn't even start until lint passes — saving CI compute minutes. The improvement isn't just faster feedback, it's also lower cost.

## Coding Challenge

Set up a GitHub Actions workflow for a multi-module Android project that does the following:

- **Job 1 (lint):** Run `lintDebug` across all modules. Upload the HTML lint report as an artifact on failure.
- **Job 2 (unit-tests):** Run `testDebugUnitTest` across all modules. Upload JUnit XML results as an artifact (always, even on failure).
- **Job 3 (build):** Only runs if Job 1 and Job 2 both pass. Build the debug APK and upload it as an artifact.
- **Bonus:** Add Gradle dependency caching using `gradle/actions/setup-gradle` and ensure PR branches only read from the cache (not write).

Test your workflow by creating a PR with a deliberate lint violation and confirming that Job 3 never runs.

Thanks for reading!
