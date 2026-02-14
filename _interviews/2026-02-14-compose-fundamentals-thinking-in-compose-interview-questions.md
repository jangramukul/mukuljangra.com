---
title: "Compose Fundamentals & Thinking in Compose"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 16
sequence: 16
description: "Compose fundamentals come up in almost every Android interview now."
---

## Compose Fundamentals & Thinking in Compose

If you're interviewing for an Android role right now, Compose is going to come up. Not "might" — *will*. This covers the declarative mental model, how the compiler and runtime secretly conspire behind your back, and why Compose thinks so differently from the old View system.

#### What is Jetpack Compose?

Jetpack Compose is Android's modern UI toolkit, and it flips the script on how you build screens. Instead of inflating XML and grabbing view references to mutate them, you write Kotlin functions that *describe* what the UI should look like for a given state. The framework takes it from there — figuring out what to render and how to update it. You declare, Compose delivers.

#### What is a @Composable function?

It's the fundamental building block. You slap `@Composable` on a function, and suddenly the Compose compiler knows to process it differently. Here's the thing — a composable function doesn't return a View or any UI object. It *describes* UI by calling other composable functions, and the framework assembles the tree from those calls.

```kotlin
@Composable
fun Greeting(name: String) {
    Text(text = "Hello, $name")
}
```

Composable functions must be fast, idempotent, and free of side effects because they can be re-executed at any time during recomposition.

#### What is the difference between declarative and imperative UI?

Think of it like giving directions. Imperative UI (XML + Views) is turn-by-turn: "Take the first left, go 200 meters, turn right at the gas station." You call `setText()`, `setVisibility()`, `addView()` — telling the framework *how* to update each widget step by step. Declarative UI (Compose) is more like giving the destination: "Here's the address, you figure out the route." You describe *what* the screen should look like for a given state, and the framework handles the rest.

The practical win? Imperative UI forces you to manage widget state manually, which gets messy fast as your UI grows. Declarative UI eliminates that entire category of bugs because you never hold references to UI objects — you just re-describe the screen.

#### How does Compose differ from the XML View system?

- **No view references** — In XML, you use `findViewById` or ViewBinding to get references and mutate them. In Compose, there are no view objects. You describe UI as functions of state.
- **Composition over inheritance** — The View system uses class inheritance heavily (TextView extends View, Button extends TextView). Compose uses function composition — you build UI by calling composable functions inside other composable functions.
- **No XML layouts** — UI is written entirely in Kotlin. You get full language features like `if`, `for`, and `when` directly in your UI code.
- **Built-in state management** — Compose has `remember`, `mutableStateOf`, and state hoisting baked in. With Views, you needed LiveData or custom solutions to keep UI in sync with data.
- **Recomposition vs invalidation** — Views use `invalidate()` and `requestLayout()` to trigger re-draws. Compose automatically re-executes only the composable functions that read changed state.

#### What does "composition over inheritance" mean in Compose?

In the View system, if you wanted a clickable image with text, you'd either subclass ImageView or create a custom ViewGroup. This leads to deep inheritance hierarchies — like a family tree that nobody wants to maintain. Compose takes the opposite approach. You compose small, focused functions together. A clickable image with text is just `Row { Image(...); Text(...) }` wrapped in a `clickable` modifier. No class to subclass, no hierarchy to untangle.

#### What is Composition in Compose?

Composition is the tree structure that Compose builds from your composable function calls. Think of it like a blueprint. During initial composition, Compose executes your functions and records everything in a data structure called the slot table — parameters, structure, the works. This blueprint describes what's on screen. When state changes, Compose runs recomposition to update the blueprint. The Composition can only be created by initial composition and updated through recomposition — there's no other way in.

> **🧠 Think about it:** If Compose re-runs your composable functions on every state change, what would happen if those functions had side effects like writing to a database or making a network call?

#### What is recomposition?

Recomposition is Compose re-executing your composable functions when state changes. But here's where it gets clever — Compose doesn't blindly re-run everything. It tracks which `State` objects each composable reads, and when a value changes, it schedules recomposition *only* for the composables that read that state. Functions whose inputs haven't changed? Skipped entirely.

Plot twist: recomposition is also optimistic. If state changes *again* while recomposition is in progress, Compose may cancel the current pass and restart with the new state. This is exactly why composable functions must not have side effects — a cancelled recomposition would leave those side effects in an inconsistent state.

#### What happens during initial composition vs recomposition?

During initial composition, Compose executes every composable function in the tree for the first time. Each call is recorded in the slot table with its parameters, remembered values, and child composables. This builds the complete UI tree. Layout and drawing happen after composition completes.

During recomposition, Compose only re-executes functions that read state values that changed. It walks the slot table, compares current parameters with stored parameters, and skips functions whose inputs are unchanged. New composables are inserted, removed ones leave the tree, unchanged ones are kept as-is. After recomposition finishes, layout and drawing run only for the parts that actually changed.

#### What are the three phases of Compose?

Compose renders UI in three phases — and understanding which phase your state read triggers is the key to performance:

- **Composition** — Compose runs your composable functions and builds the UI tree. It determines *what* to show on screen.
- **Layout** — Compose measures and positions each element. It determines *where* to place them. This works in a single pass — each node measures its children, decides its own size, and places children relative to itself.
- **Drawing** — Elements are drawn on the canvas. It determines *how* to render pixels.

Here's the performance trick: state reads in different phases trigger different levels of work. If you read state only in the drawing phase (inside `drawBehind`, for example), Compose skips composition and layout entirely and only re-draws. Push state reads as late as possible.

#### What is @Preview and how does it work?

`@Preview` lets you see composable functions rendered in Android Studio without running on a device. You annotate a parameterless composable with `@Preview`, and Studio renders it right in the design panel. You can customize it with parameters like `showBackground`, `widthDp`, `heightDp`, `uiMode`, and `device`.

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

Previews run in a special Studio environment, not on a real device. They can't access runtime resources like network, database, or system services. Use fake data or preview-specific providers for dependencies.

> **🧠 Think about it:** `mutableStateOf` creates observable state, and `remember` survives recomposition. What happens if you use one without the other?

#### What is the difference between remember and mutableStateOf?

Yeah, this trips up everyone. They solve different problems and are almost always used together.

`mutableStateOf` creates an observable state holder — when its value changes, any composable that reads it gets scheduled for recomposition. But it doesn't survive recomposition on its own. Without `remember`, every recomposition creates a brand new state holder, and your previous value is gone. Poof.

`remember` stores a value in the slot table so it survives recomposition. But `remember { 0 }` stores a plain value — changing it doesn't trigger recomposition because Compose has no idea the value changed.

The combination `remember { mutableStateOf(0) }` gives you both: a value that survives recomposition *and* triggers recomposition when changed. It's like getting a notebook that both remembers what you wrote *and* notifies everyone when you update it.

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

#### How does remember work internally?

`remember` stores a value in the Composition's slot table at the current position in the tree. During initial composition, it executes the calculation lambda and stores the result. On subsequent recompositions, it returns the stored value without re-executing the lambda. The key detail — `remember` is *positional*. The slot table tracks values by their position in the composable call hierarchy, not by variable name.

If you use `remember` inside a loop or conditional, each call site gets its own slot. If the structure of your composable tree changes (an `if` branch is added or removed), the slot table entries shift, and previously remembered values may get associated with different composables. This is why `key()` exists — it lets you provide a stable identity independent of position.

#### Why does Compose use functions instead of classes for UI components?

Classes carry state and identity inherently — each instance has its own memory and lifecycle. It's like giving every UI element a backpack full of stuff it has to carry around. Functions are stateless by default, which aligns with the declarative principle of describing UI as a function of state. State is explicitly managed through `remember` and state hoisting, making it visible and controllable.

Functions also compose more naturally. You call one function inside another — no inheritance, no constructor parameters to pass, no lifecycle to manage. The Compose compiler handles lifecycle and identity through positional memoization. This is fundamentally different from the View system, where `View` objects are long-lived stateful entities managed by the framework.

#### What is the role of the Compose compiler plugin?

Here's the thing — without the compiler plugin, `@Composable` is just a decoration that does absolutely nothing. The plugin is the real magic. It transforms `@Composable` functions at compile time, adding hidden parameters for managing the composition — a `Composer` object that tracks the slot table, group markers for positional memoization, and change tracking logic. The plugin is what makes recomposition, state tracking, and skipping possible.

Since Compose 1.5.0, the compiler plugin moved to the Kotlin repository and its versioning is tied to the Kotlin compiler version, so you no longer need to match Compose compiler and Kotlin versions separately.

#### What is the difference between Compose Runtime and Compose UI?

The Compose Runtime is the engine under the hood — it handles the slot table, state tracking, recomposition scheduling, and the `@Composable` function execution model. It has zero concept of Android, views, or pixels. The Compose UI layer is built *on top* of the runtime and provides the actual UI components like `Text`, `Column`, `Modifier`, layout, drawing, and input handling.

This separation is why Compose is described as "a general-purpose tool for managing a tree of nodes of any type." The runtime can manage any tree structure, not just UI. You could build a Compose compiler target for any platform — the runtime genuinely doesn't care what the nodes are.

> **🧠 Think about it:** If a composable receives a `List<String>` from another module, can Compose skip it during recomposition? Why or why not?

#### How does Compose decide to skip a composable during recomposition?

A composable is eligible for skipping when all its parameters are unchanged from the previous composition. Compose compares parameter values using `equals()` for stable types. A type is stable if Compose can determine at compile time that its `equals()` is reliable — primitives, `String`, lambda types, and classes annotated with `@Stable` or `@Immutable` qualify.

Now here's where it gets interesting. If a parameter is an unstable type (a class with `var` properties, a `List` from a different module), Compose can't guarantee `equals()` is consistent, so it never skips that composable. With strong skipping mode (enabled by default since Compose compiler 2.0), unstable parameters are compared by instance equality (`===`) instead of being treated as always-changed, which makes skipping more aggressive.

#### What is positional memoization?

Compose identifies each composable instance by its call site — the location in the source code where the function is called. The compiler plugin generates a unique key for each call site using the file path, line number, and column. During recomposition, Compose uses these keys to match composable instances from the previous composition to the current one. That's positional memoization — values are memoized based on their position in the call tree.

When you call a composable inside a loop, all calls share the same call site. Compose falls back to using the execution index to distinguish them. This works fine for appending to the end of a list, but inserting or reordering items causes Compose to mismatch instances. The `key()` composable solves this by providing an explicit identity that overrides the positional key.

#### What is the slot table?

The slot table is where Compose keeps its receipts. It's the internal data structure that stores the state of the composition — parameters, remembered values, and structure of every composable in the tree. Think of it as a linear array that mirrors the composable call hierarchy. Each composable occupies a range of slots, and child composables are nested within their parent's range.

During recomposition, Compose walks the slot table and compares current values with stored values to decide what changed. It's different from a virtual DOM — there's no tree diffing algorithm. Compose knows exactly which composables to re-execute because state tracking tells it which functions read changed state. The slot table is just where the results are stored and compared.

#### How does the Compose compiler transform @Composable functions at bytecode level?

The compiler adds several hidden parameters to every `@Composable` function:

- A `Composer` parameter that manages the slot table and tracks the current position in the composition
- A `$changed` bitmask that encodes whether each parameter has changed since the last composition, used for skip-checking
- For functions with more than a few parameters, additional `$default` bitmasks

At function entry, the generated code checks the `$changed` bitmask. If all parameters are unchanged and the function is restartable, it returns early — this is the skip logic. The function body is wrapped in `startRestartGroup` / `endRestartGroup` calls that manage the slot table bookkeeping. Every `remember` call, every state read, and every child composable call goes through the `Composer`.

#### Can composable functions run in parallel?

Compose reserves the right to run composable functions in parallel across multiple threads. In practice, the current implementation doesn't do this aggressively, but the design allows it. This is why composable functions must not have side effects — writing to shared variables, modifying global state, or calling non-thread-safe functions from a composable body is unsafe.

If you need to perform side effects, use the effect APIs (`LaunchedEffect`, `SideEffect`, `DisposableEffect`) which run on the main thread in a controlled way. For callbacks like `onClick`, those always execute on the UI thread, so they're safe for triggering state changes.

### Common Follow-ups

- How does `rememberSaveable` differ from `remember` in terms of what it stores and when?
- What happens if you read a state value inside a `LaunchedEffect` — does it trigger recomposition?
- How does the `key()` composable affect the slot table identity?
- Can you use Compose runtime without Compose UI? Give an example.
- How does strong skipping mode change the behavior of recomposition for unstable types?
- What is donut-hole skipping and how does it work with inline lambdas?
- How does `derivedStateOf` reduce unnecessary recompositions?
- What is the difference between `@Stable` and `@Immutable` annotations?
