---
title: "Dependency Injection Mastery"
layout: course
description: "DI principles, Hilt, Metro, KSP, multi-module DI, and the patterns that keep dependency graphs clean and testable."
icon: "🔌"
icon_svg: '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="10" stroke="#f472b6" stroke-width="1.8" fill="rgba(244,114,182,0.1)"/><circle cx="14" cy="14" r="4" stroke="#f472b6" stroke-width="1.5" fill="rgba(244,114,182,0.2)"/><line x1="14" y1="4" x2="14" y2="10" stroke="#f472b6" stroke-width="1.5"/><line x1="14" y1="18" x2="14" y2="24" stroke="#f472b6" stroke-width="1.5"/><line x1="4" y1="14" x2="10" y2="14" stroke="#f472b6" stroke-width="1.5"/><line x1="18" y1="14" x2="24" y2="14" stroke="#f472b6" stroke-width="1.5"/></svg>'
color: "#f472b6"
difficulty: "Intermediate to Expert"
modules: 6
topics: 12
duration: "5 weeks"
order: 7
tags:
  - Dependency Injection
  - Hilt
  - Android
what_you_learn:
  - "Understand why DI matters and how it improves testability"
  - "Build dependency graphs with Hilt from scratch to advanced patterns"
  - "Navigate the Dagger to Metro migration path"
  - "Choose between KSP and KAPT for code generation"
  - "Design DI for multi-module projects"
  - "Follow DI best practices that scale with team size"
prerequisites:
  - "Kotlin fundamentals"
  - "Android development experience"
  - "Clean Architecture basics"
---

## Module 1: DI Foundations

Why dependency injection exists, what problems it solves, and the principles that apply regardless of which framework you use.

- [What's the main purpose of DI?](/guide/purpose-of-di/)
- [Dependency Injection Best Practices Guide](/guide/dependency-injection-best-practises/)

## Module 2: Hilt

Google's recommended DI framework for Android. Modules, components, scopes, qualifiers, assisted inject, and the patterns for building real dependency graphs.

- [Hilt Complete Guide](/guide/hilt-complete-guide/)

## Module 3: Code Generation

The annotation processors that power DI frameworks. KSP vs KAPT, build speed impact, and why migrating to KSP matters.

- [KSP vs KAPT — Why You Should Migrate Today](/guide/ksp-vs-kapt-migration/)

## Module 4: Next-Gen DI with Metro

Metro is building the future of Android DI. Runtime injection, no annotation processing, faster builds, and a simpler mental model.

- [Metro — Next Generation Dependency Injection for Android](/guide/metro-next-gen-di-android/)
- [From Dagger to Metro — A Migration Story](/guide/dagger-to-metro-migration/)

## Module 5: Multi-Module DI

DI in modularized projects. Module boundaries, component dependencies, feature module injection, and the patterns that prevent circular dependencies.

- [Modularization Basics Guide](/guide/modularization-basics/)
- [Modularization Best Practices Guide](/guide/modularization-best-practises/)

## Module 6: DI in Practice

Testing with DI, writing testable code with proper dependency boundaries, and the architectural patterns that make DI feel natural.

- [How To Write Testable Code?](/guide/writing-testable-code/)
- [Testing Best Practises Guide](/guide/testing-best-practises/)
- [Application Level Best Practises](/guide/application-level-best-practises/)
- [Common Architectural Principles Guide](/guide/common-architectural-principles/)
