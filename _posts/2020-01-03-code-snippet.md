---
title: Code Snippet
layout: post
categories: post

tags:
  - Android
  - DI

---

Imagine that, we have to create lots of objects which are depends on one another to perform some operations. As codebase grows, we need some external support to manage those objects in flexible way. It’s a bad practise if we create same objects again and again. It push Garbage collector to collect those unused objects and erase them. Due to unallocation of objects by Garbage collector, the main thread of application have to work more.

```kotlin
private data class Car(val blocker: Boolean)
private fun getPosts(): Boolean {
    val posts = network.getPosts()
    return posts.status
}
```

```kotlin
private data class Car(val blocker: Boolean)
private fun getPosts(): Boolean {
    val posts = network.getPosts()
    return posts.status
}
```

> This is highllisted