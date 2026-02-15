---
title: What's the main purpose of DI?
layout: post
categories: post

tags:
  - Android

---

Imagine that, we have to create lots of objects which are depends on one another to perform some operations. As codebase grows, we need some external support to manage those objects in flexible way. It’s a bad practise if we create same objects again and again. It push Garbage collector to collect those unused objects and erase them. Due to unallocation of objects by Garbage collector, the main thread of application have to work more.

By using DI, We able to inject dependencies into testing frameworks to provide better and safe environment for testing. And also, no doubt, It’s makes object access thread-safe.

If we provide manually injected dependencies into global context that is can accessible from anywhere, anytime. This comes with cost of thread-safety and tight coupling of dependencies. It also makes the testing harder, as all our instances are tight coupled.





