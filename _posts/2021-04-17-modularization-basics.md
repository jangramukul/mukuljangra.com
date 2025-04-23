---
title: Modularization Basics Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
  
---
In an ever-growing code base, scalability, readability, testability, and overall code quality often decrease over time. This comes as a result of the codebase increasing in size without its maintainers taking active measures to enforce an easily maintainable structure. Modularization is a means of structuring your codebase in a way that improves maintainability and helps avoid these problems.

It's a practise of organizing a code base into loosely coupled and self-contained parts. Each part is a module. Each module is independent and serves a clear purpose. In Modularization, it depends on you to divide your app into different modules by the feature or by the architecture layers. At some points, you might be confused about choosing module separation. You should separate it by features with architecture layers. But each feature module should not depend on other feature modules. You should keep it independent as much as you can. It improves the reusability of modules. Each feature module cannot communicate directly with other feature modules. In fact, the App module has the access to all modules of the app.

You might think, can we have multiple databases according to app features? Or should we only hold one database for an app? As a solution to this, you can adopt both approaches. It depends on your app needs. You should not go for the multiple databases approach if your app needs database tables join-related data. If your app doesn't have to deal with multiple database's tables joins, you can adopt the multiple databases approach easily.

While dealing with app navigation, you should hold a central place where all your navigation screens are combined to make awesome app navigation. You can choose App Module as the central place and easily manage your app navigation into this.


Thank You!






