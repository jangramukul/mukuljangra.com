---
title: "Graphs — BFS, DFS & Traversals"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 6
sequence: 46
description: "Graph problems are among the most common in coding interviews."
---

## Graphs — BFS, DFS & Traversals

Here's the thing about graph problems in interviews — they look scary at first, but almost all of them boil down to two ideas: BFS and DFS. Once you really get traversals, problems like number of islands, course schedule, and word ladder stop being unique puzzles and start feeling like the same pattern wearing different outfits.

#### How do you solve the Number of Islands problem?

Think of the grid like a satellite photo of an ocean with landmasses. You're scanning from top-left to bottom-right, and every time you spot a '1' you haven't visited, that's a new island. You then "flood fill" it — walk through all connected land cells using DFS and mark them as visited so you don't count them again.

```kotlin
fun numIslands(grid: Array<CharArray>): Int {
    val rows = grid.size
    val cols = grid[0].size
    var count = 0

    fun dfs(r: Int, c: Int) {
        if (r !in 0 until rows || c !in 0 until cols || grid[r][c] == '0') return
        grid[r][c] = '0'
        dfs(r + 1, c); dfs(r - 1, c); dfs(r, c + 1); dfs(r, c - 1)
    }

    for (r in 0 until rows) for (c in 0 until cols) {
        if (grid[r][c] == '1') { count++; dfs(r, c) }
    }
    return count
}
```

Time O(m * n), space O(m * n) worst case for recursion stack.

#### How does BFS work and when do you use it?

BFS is like dropping a stone in a pond — the ripples spread outward one ring at a time. It explores all nodes at distance 1, then distance 2, then distance 3, and so on, using a queue. Because it visits nodes in order of their distance from the source, it naturally finds the shortest path in unweighted graphs.

```kotlin
fun bfs(graph: Map<Int, List<Int>>, start: Int): List<Int> {
    val visited = mutableSetOf(start)
    val queue: Queue<Int> = LinkedList()
    queue.add(start)
    val order = mutableListOf<Int>()
    while (queue.isNotEmpty()) {
        val node = queue.poll()
        order.add(node)
        for (neighbor in graph[node].orEmpty()) {
            if (neighbor !in visited) {
                visited.add(neighbor)
                queue.add(neighbor)
            }
        }
    }
    return order
}
```

Time O(V + E), space O(V). Reach for BFS whenever you need shortest path in an unweighted graph or level-order traversal.

#### How does DFS work and when do you use it?

DFS is the opposite personality — instead of spreading wide, it dives deep. It picks one path and follows it all the way to a dead end before backtracking and trying another. Think of it like exploring a maze by always turning left until you hit a wall, then backing up. You can implement it with recursion (which uses the call stack) or an explicit stack.

```kotlin
fun dfs(graph: Map<Int, List<Int>>, start: Int): List<Int> {
    val visited = mutableSetOf<Int>()
    val order = mutableListOf<Int>()
    fun explore(node: Int) {
        visited.add(node)
        order.add(node)
        for (neighbor in graph[node].orEmpty()) {
            if (neighbor !in visited) explore(neighbor)
        }
    }
    explore(start)
    return order
}
```

Time O(V + E), space O(V). DFS is your go-to for path finding, cycle detection, connected components, and topological sort.

> **🧠 Think about it:** If BFS guarantees the shortest path in an unweighted graph, why would you ever choose DFS over it? What does DFS give you that BFS doesn't?

#### How do you solve the Course Schedule problem?

This is really a "can I finish all my tasks if some depend on others?" problem. Courses are nodes, prerequisites are directed edges, and the question is: is there a cycle? If Course A requires Course B, which requires Course C, which requires Course A — you're stuck forever. Kahn's algorithm handles this by repeatedly picking courses with no remaining prerequisites.

```kotlin
fun canFinish(numCourses: Int, prerequisites: Array<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    val inDegree = IntArray(numCourses)
    for ((course, prereq) in prerequisites) {
        graph.getOrPut(prereq) { mutableListOf() }.add(course)
        inDegree[course]++
    }
    val queue: Queue<Int> = LinkedList()
    for (i in 0 until numCourses) if (inDegree[i] == 0) queue.add(i)
    var completed = 0
    while (queue.isNotEmpty()) {
        val course = queue.poll()
        completed++
        for (next in graph[course].orEmpty()) {
            inDegree[next]--
            if (inDegree[next] == 0) queue.add(next)
        }
    }
    return completed == numCourses
}
```

Time O(V + E). If `completed` doesn't reach `numCourses`, there's a cycle — some courses are stuck waiting on each other.

#### What is the difference between BFS and DFS?

Here's a nice way to think about it. BFS is like searching floor by floor in a building — you check every room on floor 1 before going to floor 2. DFS is like following one hallway all the way to the end before coming back. BFS finds the shortest path in unweighted graphs because of that level-by-level nature. DFS doesn't guarantee shortest path, but it uses less memory since it only holds the current path on the stack.

- Use BFS for shortest path and level-order problems
- Use DFS for topological sort, cycle detection, connected components, and backtracking

#### What is topological sort and when is it used?

Topological sort gives you a linear ordering of nodes in a DAG where every node comes before the nodes that depend on it. It's like figuring out the order to get dressed — socks before shoes, underwear before pants. You can't put on shoes before socks. Any time you have dependency resolution — build systems, course prerequisites, task scheduling — topological sort is the answer.

#### How do you implement topological sort using Kahn's algorithm?

Kahn's algorithm is beautifully intuitive. Start by finding all nodes with zero in-degree — these are the ones with no dependencies, so they're safe to process first. Process each one, and for every neighbor, decrement its in-degree (one of its dependencies is done). When a neighbor hits zero, it's ready — add it to the queue.

```kotlin
fun topologicalSort(n: Int, edges: List<IntArray>): List<Int> {
    val graph = HashMap<Int, MutableList<Int>>()
    val inDegree = IntArray(n)
    for ((u, v) in edges) {
        graph.getOrPut(u) { mutableListOf() }.add(v)
        inDegree[v]++
    }
    val queue: Queue<Int> = LinkedList()
    for (i in 0 until n) if (inDegree[i] == 0) queue.add(i)
    val result = mutableListOf<Int>()
    while (queue.isNotEmpty()) {
        val node = queue.poll()
        result.add(node)
        for (neighbor in graph[node].orEmpty()) {
            inDegree[neighbor]--
            if (inDegree[neighbor] == 0) queue.add(neighbor)
        }
    }
    return if (result.size == n) result else emptyList()
}
```

If the result has fewer than V nodes, the graph has a cycle — some nodes are forever stuck with non-zero in-degree because they depend on each other.

> **🧠 Think about it:** In the Kahn's algorithm code above, what happens if you replace the queue with a stack? Would the result still be a valid topological ordering?

#### How do you detect a cycle in a directed graph?

Here's the trick — use DFS with three colors instead of the usual two. A node is either unvisited (white), currently being explored (gray), or fully done (black). If during your DFS you run into a gray node, that means you've found a path back to a node you're still in the middle of exploring. That's a cycle.

```kotlin
fun hasCycleDirected(n: Int, edges: List<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    for ((u, v) in edges) graph.getOrPut(u) { mutableListOf() }.add(v)
    val state = IntArray(n) // 0=unvisited, 1=visiting, 2=visited

    fun dfs(node: Int): Boolean {
        state[node] = 1
        for (neighbor in graph[node].orEmpty()) {
            if (state[neighbor] == 1) return true
            if (state[neighbor] == 0 && dfs(neighbor)) return true
        }
        state[node] = 2
        return false
    }

    for (i in 0 until n) if (state[i] == 0 && dfs(i)) return true
    return false
}
```

#### How do you detect a cycle in an undirected graph?

But wait — the three-color trick doesn't work for undirected graphs because every edge goes both ways. Instead, you track the parent. If DFS visits a neighbor that's already been visited and that neighbor isn't the node you just came from, you've found a cycle. It's like walking through a city and arriving at a street you've already been on — but not the one you just turned off of.

```kotlin
fun hasCycleUndirected(n: Int, edges: List<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    for ((u, v) in edges) {
        graph.getOrPut(u) { mutableListOf() }.add(v)
        graph.getOrPut(v) { mutableListOf() }.add(u)
    }
    val visited = BooleanArray(n)

    fun dfs(node: Int, parent: Int): Boolean {
        visited[node] = true
        for (neighbor in graph[node].orEmpty()) {
            if (!visited[neighbor]) {
                if (dfs(neighbor, node)) return true
            } else if (neighbor != parent) return true
        }
        return false
    }

    for (i in 0 until n) if (!visited[i] && dfs(i, -1)) return true
    return false
}
```

#### What are the main ways to represent a graph?

- **Adjacency List** — Each node keeps a list of its neighbors. This is what you'll use in 90% of interview problems. O(V + E) space
- **Adjacency Matrix** — A 2D array where `matrix[i][j] = 1` means there's an edge. O(V^2) space, so it's only practical for dense graphs where most nodes connect to most other nodes
- **Edge List** — Just a flat list of (u, v) pairs. O(E) space. You'll mostly see this with Kruskal's algorithm

```kotlin
val graph = HashMap<Int, MutableList<Int>>()
fun addEdge(u: Int, v: Int) {
    graph.getOrPut(u) { mutableListOf() }.add(v)
    graph.getOrPut(v) { mutableListOf() }.add(u)
}
```

#### How do you solve the Word Ladder problem?

This is a BFS shortest-path problem in disguise. Picture each word as a node, and two words are connected if they differ by exactly one character. You're finding the shortest path from the begin word to the end word. BFS is the natural choice here because you want the minimum number of transformations.

```kotlin
fun ladderLength(beginWord: String, endWord: String, wordList: List<String>): Int {
    val wordSet = wordList.toMutableSet()
    if (endWord !in wordSet) return 0
    val queue: Queue<String> = LinkedList()
    queue.add(beginWord)
    var steps = 1
    while (queue.isNotEmpty()) {
        repeat(queue.size) {
            val word = queue.poll()
            if (word == endWord) return steps
            val chars = word.toCharArray()
            for (i in chars.indices) {
                val original = chars[i]
                for (c in 'a'..'z') {
                    chars[i] = c
                    val newWord = String(chars)
                    if (newWord in wordSet) {
                        queue.add(newWord)
                        wordSet.remove(newWord)
                    }
                }
                chars[i] = original
            }
        }
        steps++
    }
    return 0
}
```

> **🧠 Think about it:** The Word Ladder solution tries all 26 characters at each position to find neighbors. Could you precompute the neighbors more efficiently? What if the word list had a million words?

#### How do you clone a graph?

Think of it like photocopying a social network. You need to create a copy of every person (node) and recreate all their friendships (edges) — but you have to make sure you don't create duplicate copies. A HashMap solves this: it maps each original node to its clone. When you visit a node for the first time, create its clone. When you see it again, just grab the existing clone from the map.

```kotlin
class GraphNode(var value: Int, var neighbors: MutableList<GraphNode> = mutableListOf())

fun cloneGraph(node: GraphNode?): GraphNode? {
    if (node == null) return null
    val clones = HashMap<GraphNode, GraphNode>()

    fun dfs(original: GraphNode): GraphNode {
        clones[original]?.let { return it }
        val copy = GraphNode(original.value)
        clones[original] = copy
        for (neighbor in original.neighbors) {
            copy.neighbors.add(dfs(neighbor))
        }
        return copy
    }
    return dfs(node)
}
```

#### How do you check if a graph is bipartite?

A graph is bipartite if you can split all nodes into two groups such that every edge connects a node in one group to a node in the other. Think of it like seating people at two tables where no two friends sit at the same table. The approach: try to two-color the graph using BFS. Assign one color to the start node, the opposite color to all its neighbors, and keep going. If you ever find a neighbor that already has the same color as the current node, it's not bipartite.

```kotlin
fun isBipartite(graph: Array<IntArray>): Boolean {
    val n = graph.size
    val color = IntArray(n) { -1 }
    for (i in 0 until n) {
        if (color[i] != -1) continue
        val queue: Queue<Int> = LinkedList()
        queue.add(i)
        color[i] = 0
        while (queue.isNotEmpty()) {
            val node = queue.poll()
            for (neighbor in graph[node]) {
                if (color[neighbor] == -1) {
                    color[neighbor] = 1 - color[node]
                    queue.add(neighbor)
                } else if (color[neighbor] == color[node]) {
                    return false
                }
            }
        }
    }
    return true
}
```

#### How do you find connected components in an undirected graph?

This is straightforward once you know traversal. Walk through every node. If a node hasn't been visited yet, that's the start of a new component — kick off a BFS or DFS from it to mark all reachable nodes as visited. Every time you start a new traversal, that's one more component. It's like counting separate friend groups in a school — each group is a connected component.

### Common Follow-ups

- What's the difference between BFS and Dijkstra's algorithm?
- How would you find the shortest path in a graph with 0 and 1 edge weights?
- How do you find all paths between two nodes?
- How does bidirectional BFS work for Word Ladder?
- What is the difference between Kahn's and DFS-based topological sort?
- How would you find the shortest cycle in an undirected graph?
- Can you detect a cycle using BFS in a directed graph?
