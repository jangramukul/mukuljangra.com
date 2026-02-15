---
title: "Kotlin Coroutines & Flows"
layout: course
description: "Master structured concurrency, suspend functions, Flow operators, StateFlow, Channels, and exception handling for production Android apps."
icon: "⚡"
icon_svg: '<svg width="28" height="28" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><linearGradient id="coroutine-a" x1="0" x2="128" y1="128" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#E44857"/><stop offset=".47" stop-color="#C711E1"/><stop offset="1" stop-color="#7F52FF"/></linearGradient><path fill="url(#coroutine-a)" d="M0 128L64 64 128 128zM0 0h128L64 64 0 128z"/><path d="M48 36l24 28-24 28" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M72 36l-24 28 24 28" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".5" transform="translate(8,0)"/></svg>'
color: "#fbbf24"
difficulty: "Intermediate to Expert"
modules: 7
topics: 26
duration: "10 weeks"
order: 2
tags:
  - Kotlin Coroutines
  - Flows
  - Android
what_you_learn:
  - "Understand structured concurrency and coroutine lifecycle"
  - "See how the compiler transforms suspend functions into state machines"
  - "Handle exceptions and cancellation in production coroutine code"
  - "Build reactive data streams with Flow, StateFlow, and SharedFlow"
  - "Use Flow operators — map, filter, combine, flatMapLatest, debounce"
  - "Implement Channels and backpressure strategies for coroutine communication"
  - "Test coroutines and Flows with Turbine and TestDispatcher"
prerequisites:
  - "Kotlin fundamentals"
  - "Basic Android development"
---

## Module 1: Coroutines Fundamentals

The building blocks of Kotlin's concurrency model. Coroutine builders, scopes, dispatchers, and structured concurrency — everything you need to launch your first coroutine and understand why it's fundamentally different from threads.

- [Kotlin Coroutines Fundamentals Guide](/guide/kotlin-coroutines-fundamentals-guide/)
- [Kotlin Structured Concurrency Guide](/guide/kotlin-structured-concurrency-guide/)
- [Kotlin Dispatchers Guide](/guide/kotlin-dispatchers-guide/)
- [Kotlin Suspend Functions Guide](/guide/kotlin-suspend-functions-guide/)
- [Android Threading With Handler and Looper](/guide/android-threading-handler-looper/)

## Module 2: Coroutines Under the Hood

What actually happens when you mark a function `suspend`. CPS transformation, the state machine the compiler generates, continuation internals, and the performance implications of coroutines on the JVM.

- [Kotlin Coroutines Under the Hood](/guide/kotlin-coroutines-under-the-hood/)
- [Kotlin Coroutine Debugging Guide](/guide/kotlin-coroutine-debugging-guide/)

## Module 3: Exception Handling and Cancellation

Exception propagation, SupervisorJob, cancellation as a cooperative contract — the hardest part of coroutines to get right, and the part that causes the most production bugs.

- [Kotlin Coroutines Exception Handling](/guide/kotlin-coroutines-exception-handling/)
- [Kotlin Coroutine Cancellation Guide](/guide/kotlin-coroutine-cancellation-guide/)
- [Kotlin withTimeout Patterns Guide](/guide/kotlin-withtimeout-patterns-guide/)

## Module 4: Kotlin Flow

Cold streams, transformation operators, combining flows, context preservation — the reactive programming model built on top of coroutines.

- [Kotlin Flows With Operators Guide](/guide/master-kotlin-flows-with-operators/)
- [Kotlin Flow Context and flowOn Guide](/guide/kotlin-flow-context-flowon-guide/)
- [Kotlin Flow Rate Limiting Guide](/guide/kotlin-flow-rate-limiting-guide/)

## Module 5: StateFlow, SharedFlow, and Hot Streams

Hot streams for state management and event broadcasting. StateFlow for UI state, SharedFlow for events, stateIn/shareIn for converting cold flows, and safe collection in Android lifecycle.

- [stateIn vs shareIn — When to Use Which and Why](/guide/statein-vs-sharein/)
- [Kotlin StateFlow and SharedFlow Guide](/guide/kotlin-stateflow-sharedflow-guide/)
- [Kotlin Flow Collection in Android Guide](/guide/kotlin-flow-collection-android-guide/)
- [Dispatchers.Unconfined Is a Trap — Use EmptyCoroutineContext](/guide/dispatchers-unconfined-trap/)

## Module 6: Channels and Concurrency

Channels for coroutine communication, callbackFlow for bridging callback APIs, backpressure strategies, and shared mutable state with Mutex and Semaphore.

- [Kotlin Channels Guide](/guide/kotlin-channels-guide/)
- [Kotlin callbackFlow Guide](/guide/kotlin-callbackflow-guide/)
- [Kotlin Coroutine Synchronization Guide](/guide/kotlin-coroutine-synchronization-guide/)
- [Kotlin Parallel Structured Concurrency Guide](/guide/kotlin-parallel-structured-concurrency-guide/)

## Module 7: Testing and Best Practices

Testing coroutines with TestDispatcher and Turbine, ViewModel architectural patterns, and the best practices that keep coroutine code maintainable in production.

- [Turbine — The Right Way to Test Kotlin Flows](/guide/turbine-testing-kotlin-flows/)
- [The Conflation Problem of Testing StateFlows](/guide/conflation-testing-stateflows/)
- [Kotlin Coroutines Testing Guide](/guide/kotlin-coroutines-testing-guide/)
- [Kotlin Coroutines Best Practices Guide](/guide/kotlin-coroutines-best-practises/)
- [Kotlin Custom Flow Operators Guide](/guide/kotlin-custom-flow-operators-guide/)
- [Molecule Deep Dive — Compose Runtime Without the UI](/guide/molecule-deep-dive/)
