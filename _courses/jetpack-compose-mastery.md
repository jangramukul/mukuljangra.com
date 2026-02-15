---
title: "Jetpack Compose Mastery"
layout: course
description: "Build modern Android UIs from scratch — declarative thinking, state management, side effects, custom layouts, animations, performance, and testing."
icon: "🎨"
color: "#60a5fa"
difficulty: "Beginner to Expert"
modules: 10
topics: 25
duration: "12 weeks"
order: 3
tags:
  - Jetpack Compose
  - UI
  - Android
what_you_learn:
  - "Think declaratively and build UIs with composable functions"
  - "Manage state with remember, State, and ViewModel integration"
  - "Handle side effects with LaunchedEffect, DisposableEffect, and rememberUpdatedState"
  - "Build custom layouts, modifiers, and advanced theming systems"
  - "Create smooth animations with animate*AsState, AnimatedVisibility, and transitions"
  - "Optimize Compose performance — recomposition, stability, and lazy layouts"
  - "Understand Compose internals — Snapshot system, slot table, compiler transforms"
  - "Master the rendering pipeline — composition, layout, drawing phases"
  - "Build custom graphics with Canvas, Path, Brush, and BlendMode"
  - "Test Compose UIs with ComposeTestRule and semantic matchers"
prerequisites:
  - "Kotlin fundamentals"
  - "Basic Android development"
  - "XML layouts experience (helpful, not required)"
---

## Module 1: Thinking in Compose

The mental model shift from imperative to declarative UI. How composable functions work, what the compiler does behind the scenes, recomposition rules, and the three phases of the Compose rendering pipeline.

- [Composable Functions and Recomposition Guide](/guide/compose-recomposition-guide/)
- [Compose Rendering Pipeline — Composition, Layout, Drawing](/guide/compose-rendering-pipeline-guide/)
- [Defusing the Compose BOM](/guide/defusing-the-compose-bom/)

## Module 2: State Management

State is the core of Compose. How remember, mutableStateOf, and rememberSaveable work, when to hoist state, derivedStateOf and produceState for computed values, and the ViewModel integration question.

- [Compose State Management Guide](/guide/compose-state-management-guide/)
- [State Hoisting and derivedStateOf Guide](/guide/compose-state-hoisting-guide/)
- [Do You Still Need ViewModel in Compose?](/guide/compose-state-management-viewmodel-vs-presenters/)
- [Retaining State Beyond ViewModels with Circuit](/guide/retaining-state-beyond-viewmodels/)
- [Stop Using Booleans for State](/guide/stop-using-booleans-for-state/)

## Module 3: Side Effects

LaunchedEffect, DisposableEffect, SideEffect, rememberCoroutineScope, rememberUpdatedState, produceState — every side effect API, when to use each, and the mistakes that cause bugs.

- [Compose Side Effects Guide](/guide/compose-side-effects-guide/)

## Module 4: Layouts and Modifiers

Row, Column, Box, LazyColumn, LazyRow, modifier ordering, custom modifiers, and building custom layouts with the Layout composable and SubcomposeLayout.

- [Compose Layouts and Modifiers Guide](/guide/compose-layouts-modifiers-guide/)
- [Custom Layouts in Compose Guide](/guide/compose-custom-layouts-guide/)
- [RecyclerView and LazyColumn Performance Guide](/guide/recyclerview-lazycolumn-performance/)

## Module 5: Navigation

Compose Navigation, type-safe arguments, nested navigation graphs, deep links, and Navigation 3 — the compose-native navigation rebuild.

- [Compose Navigation Guide](/guide/compose-navigation-guide/)
- [Navigation 3 — Compose-Native Navigation Rebuilt from Scratch](/guide/navigation-3-compose-rebuilt/)

## Module 6: Animation

Animate*AsState, AnimatedVisibility, AnimatedContent, updateTransition, Crossfade, InfiniteTransition, and advanced patterns like shared element transitions and physics-based animation.

- [Compose Animation APIs Guide](/guide/compose-animation-guide/)
- [Advanced Compose Animation Patterns Guide](/guide/compose-advanced-animation-guide/)

## Module 7: Graphics and Custom Drawing

Canvas API, Path operations, Brush, BlendMode, shape detection, and building blur effects with Haze — the deep end of Compose rendering.

- [Compose Graphics Deep Dive — Custom Drawing and Shape Detection](/guide/compose-graphics-deep-dive/)
- [Haze — Building Blur Effects in Compose](/guide/haze-blur-effects-compose/)

## Module 8: Performance

Recomposition skipping, stability contracts, lazy layout performance, baseline profiles, R8 impact, and the Compose-specific profiling tools.

- [Compose Rendering Performance Deep Dive](/guide/compose-rendering-performance/)
- [Jetpack Compose Best Practises Guide](/guide/compose-best-practises/)

## Module 9: Compose Internals

The Compose compiler plugin, slot table, gap buffer, snapshot system, Molecule for using Compose runtime without UI — the internals that explain why Compose works the way it does.

- [Compose Snapshot System Under the Hood](/guide/compose-snapshot-system/)
- [Compose Slot Table Internals Guide](/guide/compose-slot-table-guide/)
- [Molecule Deep Dive — Compose Runtime Without the UI](/guide/molecule-deep-dive/)
- [Compose Beyond The UI?](/guide/compose-beyond-ui/)

## Module 10: Testing Compose

ComposeTestRule, semantic matchers, finder APIs, actions, assertions, testing state changes, testing animations, and integration testing patterns.

- [Compose Testing Guide](/guide/compose-testing-guide/)
