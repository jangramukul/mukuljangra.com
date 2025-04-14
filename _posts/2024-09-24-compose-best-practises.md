---
title: Jetpack Compose Best Practises
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Jetpack Compose
---

1. **Survive Recomposition**
Use `remember` to retain state across recompositions. For example, store a text field’s value to prevent resetting during UI updates.


2. **Use Side Effects**
LaunchedEffect which is used for safely launch coroutines (e.g., fetching data) tied to a composable’s lifecycle. DisposableEffect which is used for clean up resources (e.g., listeners) when a composable leaves the screen.


3. **Optimize State**
Convert multiple states into one with derivedStateOf (e.g., deriving a Boolean from a list’s size). Use produceState to wrap non-Compose states (e.g., `Flow`) into Compose-compatible states.


4. **List Performance**
Always provide a unique key in LazyColumn items and ImmutableList to help Compose identify changes efficiently and skip unnecessary recompositions.


5. **State Hoisting**
Place modifiers and state parameters at the top of composable functions for flexibility. For example, pass padding or click handlers as parameters instead of hardcoding them.


6. **CompositionLocal**
Use `LocalCompositionProvider` to implicitly pass values like spacing or themes down the composable hierarchy without prop drilling.


7. **Immutable Data**
Avoid passing mutable lists to composables. Use `ImmutableList` or wrap data in a stable `data class` annotated with `@Immutable`.


8. **Use @Stable or @Immutable**
Annotate data classes with `@Stable` or `@Immutable` to optimize Jetpack Compose performance. These annotations signal that the object’s properties rarely change, reducing unnecessary recompositions.
