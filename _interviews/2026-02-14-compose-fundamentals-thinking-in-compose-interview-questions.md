---
title: "Compose Fundamentals & Thinking in Compose"
date: 2026-02-14
layout: interview
tags: [Jetpack Compose Round]
order: 1
---

## Compose Fundamentals & Thinking in Compose

Compose fundamentals come up in almost every Android interview now. This covers the declarative mental model, how the compiler and runtime work together, and what makes Compose different from the View system.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a @Composable function?

Fundamentally, it's a building block of Compose UI. Each and every Compose UI starts with a function annotated with `@Composable` so that the compiler can understand and further process the composable UI. A composable function doesn't return a View or any UI object. It describes the UI by calling other composable functions, and the framework builds the UI tree from those calls. Composable functions must be fast, idempotent, and free of side effects because they can be re-executed at any time during recomposition.

#### Q2: What is the difference between declarative and imperative UI?

In imperative UI (XML + Views), you create a view tree and then mutate it by calling setters like `setText()`, `setVisibility()`, and `addView()`. You're telling the framework *how* to update each widget step by step. In declarative UI (Compose), you describe *what* the UI should look like for a given state, and the framework figures out how to update the screen. You call the same composable function with new arguments when state changes, and Compose handles the diffing and re-rendering.

The practical difference is that imperative UI forces you to manage widget state manually, which gets messy as your UI grows. Declarative UI eliminates that entire category of bugs because you never hold references to UI objects — you just re-describe the screen.

#### Q3: How does Compose differ from the XML View system?

- **No view references** — In XML, you use `findViewById` or ViewBinding to get references to views and mutate them. In Compose, there are no view objects to reference. You describe UI as functions of state.
- **Composition over inheritance** — The View system uses class inheritance heavily (TextView extends View, Button extends TextView). Compose uses function composition — you build UI by calling composable functions inside other composable functions.
- **No XML layouts** — UI is written entirely in Kotlin. This means you get full language features like `if`, `for`, and `when` directly in your UI code.
- **Built-in state management** — Compose has `remember`, `mutableStateOf`, and state hoisting baked into the framework. With Views, you needed LiveData or custom solutions to keep UI in sync with data.
- **Recomposition vs invalidation** — Views use `invalidate()` and `requestLayout()` to trigger re-draws. Compose automatically re-executes only the composable functions that read changed state.

#### Q4: What does "composition over inheritance" mean in Compose?

In the View system, if you wanted a clickable image with text, you'd either subclass ImageView or create a custom ViewGroup. This leads to deep inheritance hierarchies where behavior is locked into class hierarchies. Compose takes the opposite approach — you compose small, focused functions together. A clickable image with text is just `Row { Image(...); Text(...) }` wrapped in a `clickable` modifier. There's no class to subclass, no hierarchy to maintain. You combine simple building blocks into complex UIs.

#### Q5: What is Composition in Compose?

Composition is the tree structure that Compose builds from your composable function calls. During initial composition, Compose executes your composable functions and records the UI tree in a data structure called the slot table. This tree describes what's on screen. When state changes, Compose runs recomposition — it re-executes the composable functions that read changed state and updates the tree. The Composition can only be created by initial composition and updated through recomposition.

#### Q6: What is recomposition?

Composition is a part of phases in Jetpack Compose. When any declared values or data gets changed, it triggers a recomposition phase so that UI can render its new state. Compose tracks which `State` objects each composable reads, and when a state value changes, it schedules recomposition only for the composables that read that state. This is called smart recomposition — Compose skips functions whose inputs haven't changed.

Recomposition is also optimistic. If a state changes again while recomposition is in progress, Compose may cancel the current recomposition and restart with the new state. This is why composable functions must not have side effects — a cancelled recomposition would leave those side effects in an inconsistent state.

#### Q7: What are the three phases of Compose?

Compose renders UI in three phases:

- **Composition** — Compose runs your composable functions and builds the UI tree. It determines *what* to show on screen.
- **Layout** — Compose measures and positions each element. It determines *where* to place elements. This works in a single pass — each node measures its children, decides its own size, and places children relative to itself.
- **Drawing** — Elements are drawn on the canvas. It determines *how* to render pixels.

State reads in different phases trigger different levels of work. If you read state only in the drawing phase (inside `drawBehind`, for example), Compose skips composition and layout entirely and only re-draws. This is how you optimize performance — push state reads as late as possible.

#### Q8: What is the role of the Compose compiler plugin?

The Compose compiler plugin transforms `@Composable` functions at compile time. It adds hidden parameters for managing the composition — a `Composer` object that tracks the slot table, group markers for positional memoization, and change tracking logic. Without the plugin, `@Composable` is just an annotation that does nothing. The plugin is what makes recomposition, state tracking, and skipping possible. Since Compose 1.5.0, the compiler plugin moved to the Kotlin repository and its versioning is tied to the Kotlin compiler version, so you no longer need to match Compose compiler and Kotlin versions separately.

#### Q9: What is the difference between Compose Runtime and Compose UI?

This is a separation that most developers don't realize exists. The Compose Runtime is the core engine — it handles the slot table, state tracking, recomposition scheduling, and the `@Composable` function execution model. It has no concept of Android, views, or pixels. The Compose UI layer is built *on top* of the runtime and provides the actual UI components like `Text`, `Column`, `Modifier`, layout, drawing, and input handling.

This separation is why Jake Wharton describes Compose as "a general-purpose tool for managing a tree of nodes of any type." The runtime can manage any tree structure, not just UI. Libraries like Molecule use the Compose runtime to manage state in ViewModels without any UI involvement. You can build a Compose compiler target for any platform — the runtime doesn't care what the nodes are.

#### Q10: What is @Preview and how does it work?

`@Preview` lets you see composable functions rendered in Android Studio without running the app on a device. You annotate a parameterless composable function with `@Preview`, and Studio renders it in the design panel. You can customize it with parameters like `showBackground`, `widthDp`, `heightDp`, `uiMode`, and `device`.

```kotlin
@Preview(showBackground = true, widthDp = 320)
@Composable
fun ProfileCardPreview() {
    AppTheme {
        ProfileCard(
            name = "Mukul Jangra",
            role = "Senior Android Engineer"
        )
    }
}
```

Previews are compiled and run in a special Studio environment, not on a real device. They can't access runtime resources like network, database, or system services. Use fake data or preview-specific providers for dependencies.

### Deep Dive Questions (Advanced → Expert)

#### Q11: How does remember work internally?

`remember` stores a value in the Composition's slot table at the current position in the tree. During initial composition, it executes the calculation lambda and stores the result. On subsequent recompositions, it returns the stored value without re-executing the lambda. The key detail is that `remember` is positional — the slot table tracks values by their position in the composable call hierarchy, not by variable name.

This means if you use `remember` inside a loop or conditional, each call site gets its own slot. If the structure of your composable tree changes (an `if` branch is added or removed), the slot table entries shift, and previously remembered values may be associated with different composables. This is why `key()` exists — it lets you provide a stable identity independent of position.

#### Q12: What is the difference between remember and mutableStateOf?

They solve different problems and are almost always used together. `mutableStateOf` creates an observable state holder — when its value changes, any composable that reads it gets scheduled for recomposition. But `mutableStateOf` by itself doesn't survive recomposition. If you write `val count = mutableStateOf(0)` without `remember`, every recomposition creates a fresh state holder, losing the previous value.

`remember` stores a value in the slot table so it survives recomposition. But `remember { 0 }` stores a plain value — changing it doesn't trigger recomposition because Compose doesn't know the value changed.

The combination `remember { mutableStateOf(0) }` gives you both: a value that survives recomposition *and* triggers recomposition when changed.

```kotlin
@Composable
fun ClickCounter() {
    // Without remember — resets to 0 on every recomposition
    // val count = mutableStateOf(0)

    // Correct — survives recomposition AND triggers recomposition
    var count by remember { mutableStateOf(0) }

    Button(onClick = { count++ }) {
        Text("Clicked $count times")
    }
}
```

#### Q13: What is positional memoization and how does Compose identify composable instances?

Compose identifies each composable instance by its call site — the location in the source code where the function is called. The compiler plugin generates a unique key for each call site using the file path, line number, and column. During recomposition, Compose uses these keys to match composable instances from the previous composition to the current one. This is positional memoization — values are memoized based on their position in the call tree.

When you call a composable inside a loop, all calls share the same call site. Compose falls back to using the execution index to distinguish them. This works fine for appending to the end of a list, but inserting or reordering items causes Compose to mismatch instances. The `key()` composable solves this by providing an explicit identity that overrides the positional key.

#### Q14: Can composable functions run in parallel? What does that mean practically?

Compose reserves the right to run composable functions in parallel across multiple threads. In practice, the current implementation doesn't do this aggressively, but the design allows it. This is why composable functions must not have side effects — writing to shared variables, modifying global state, or calling non-thread-safe functions from a composable body is unsafe.

If you need to perform side effects, use the effect APIs (`LaunchedEffect`, `SideEffect`, `DisposableEffect`) which are dispatched on the main thread in a controlled way. For callbacks like `onClick`, those always execute on the UI thread, so they're safe for triggering state changes.

#### Q15: How does Compose decide to skip a composable during recomposition?

A composable is eligible for skipping when all its parameters are unchanged from the previous composition. Compose compares parameter values using `equals()` for stable types. A type is stable if Compose can determine at compile time that its `equals()` is reliable — primitives, `String`, lambda types, and classes annotated with `@Stable` or `@Immutable` qualify.

If a parameter is an unstable type (a class with `var` properties, a `List` from a different module), Compose can't guarantee `equals()` is consistent, so it never skips that composable. With strong skipping mode (enabled by default since Compose compiler 2.0), unstable parameters are compared by instance equality (`===`) instead of being treated as always-changed, which makes skipping more aggressive.

#### Q16: How does the Compose compiler plugin transform a @Composable function at the bytecode level?

The compiler adds several hidden parameters to every `@Composable` function:

- A `Composer` parameter that manages the slot table and tracks the current position in the composition
- A `$changed` bitmask that encodes whether each parameter has changed since the last composition, used for skip-checking
- For functions with more than a few parameters, additional `$default` bitmasks

At the function entry, the generated code checks the `$changed` bitmask. If all parameters are unchanged and the function is restartable, it returns early — this is the skip logic. The function body is wrapped in `startRestartGroup` / `endRestartGroup` calls that manage the slot table bookkeeping. Every `remember` call, every state read, and every child composable call goes through the `Composer`, which tracks what was read and what changed.

#### Q17: Why does Compose use functions instead of classes for UI components?

Classes carry state and identity inherently — each instance has its own memory and lifecycle. This makes them harder to compose, reuse, and reason about in a declarative model. Functions are stateless by default, which aligns with the declarative principle of describing UI as a function of state. State is explicitly managed through `remember` and state hoisting, making it visible and controllable.

Functions also compose more naturally. You call one function inside another — there's no need for inheritance, no constructor parameters to pass, no lifecycle to manage. The Compose compiler handles the lifecycle and identity through positional memoization. This is fundamentally different from how the View system works, where `View` objects are long-lived stateful entities managed by the framework.

#### Q18: What happens during initial composition vs recomposition?

During initial composition, Compose executes every composable function in the tree for the first time. Each function call is recorded in the slot table with its parameters, remembered values, and child composables. This builds the complete UI tree. Layout and drawing happen after composition completes.

During recomposition, Compose only re-executes composable functions that read state values that changed. It walks the slot table, compares current parameters with stored parameters, and skips functions whose inputs are unchanged. New composables are inserted into the tree, removed composables leave the tree, and unchanged composables are kept as-is. The slot table is updated in place. After recomposition finishes, layout and drawing run only for the parts of the tree that actually changed.

### Common Follow-ups

- How does `rememberSaveable` differ from `remember` in terms of what it stores and when?
- If two composable functions have the same parameters, can Compose merge them?
- What happens if you read a state value inside a `LaunchedEffect` — does it trigger recomposition?
- How does the `key()` composable affect the slot table identity?
- Can you use Compose runtime without Compose UI? Give an example.
- What is the slot table and how does it differ from a virtual DOM?
- How does strong skipping mode change the behavior of recomposition for unstable types?
- What is donut-hole skipping and how does it work with inline lambdas?
