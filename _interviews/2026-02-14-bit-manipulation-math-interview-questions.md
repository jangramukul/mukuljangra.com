---
title: "Bit Manipulation & Math"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 12
sequence: 52
description: "Bit manipulation shows up in interviews as a way to test your understanding of how numbers work at the binary level."
---

## Bit Manipulation & Math

Bit manipulation shows up in interviews to test your understanding of how numbers work at the binary level. These problems often have elegant O(1) or O(log n) solutions. Math-based questions — GCD, primes, modular arithmetic — appear less frequently but are expected at the senior level.

#### How does XOR help find a single number where every other number appears twice?

XOR has two properties: `a xor a = 0` (same values cancel) and `a xor 0 = a` (identity). XOR all elements — duplicates cancel out, leaving the unique number. Time O(n), space O(1).

```kotlin
fun singleNumber(nums: IntArray): Int {
    var result = 0
    for (num in nums) result = result xor num
    return result
}
```

#### How do you check if a number is a power of two?

A power of two has exactly one bit set. `n and (n - 1)` clears that bit. So check `n > 0 && n and (n - 1) == 0`.

```kotlin
fun isPowerOfTwo(n: Int): Boolean {
    return n > 0 && (n and (n - 1)) == 0
}
```

#### How do you count the number of 1 bits (Hamming weight)?

`n and (n - 1)` clears the lowest set bit. Count how many times until n becomes zero. Time O(k) where k is the number of set bits.

```kotlin
fun hammingWeight(n: Int): Int {
    var num = n
    var count = 0
    while (num != 0) {
        num = num and (num - 1)
        count++
    }
    return count
}
```

#### How do you find the missing number in an array of 0 to n?

XOR all numbers 0 to n with all array elements. Duplicates cancel, leaving the missing one. Time O(n), space O(1).

```kotlin
fun missingNumber(nums: IntArray): Int {
    var xor = nums.size
    for (i in nums.indices) {
        xor = xor xor i xor nums[i]
    }
    return xor
}
```

#### What are the basic bitwise operators?

- **AND (`and`)** — Both bits 1. Used for masking
- **OR (`or`)** — Either bit 1. Used for setting bits
- **XOR (`xor`)** — Exactly one bit 1. Used for toggling and finding unique elements
- **NOT (`inv()`)** — Flips all bits
- **Left shift (`shl`)** — Multiply by 2^n
- **Right shift (`shr`)** — Divide by 2^n. Kotlin also has `ushr` for unsigned right shift

#### How do you check, set, clear, and toggle a specific bit?

- **Check bit i**: `(n shr i) and 1`
- **Set bit i**: `n or (1 shl i)`
- **Clear bit i**: `n and (1 shl i).inv()`
- **Toggle bit i**: `n xor (1 shl i)`

```kotlin
fun checkBit(n: Int, i: Int): Boolean = (n shr i) and 1 == 1
fun setBit(n: Int, i: Int): Int = n or (1 shl i)
fun clearBit(n: Int, i: Int): Int = n and (1 shl i).inv()
fun toggleBit(n: Int, i: Int): Int = n xor (1 shl i)
```

#### How do you find two non-repeating numbers where every other appears twice?

XOR all elements to get `a xor b`. Find any set bit (`xorAll and -xorAll` isolates the lowest). Split numbers into two groups by that bit. XOR within each group gives a and b.

```kotlin
fun singleNumbers(nums: IntArray): IntArray {
    var xorAll = 0
    for (num in nums) xorAll = xorAll xor num
    val diffBit = xorAll and (-xorAll)
    var a = 0
    var b = 0
    for (num in nums) {
        if (num and diffBit != 0) a = a xor num
        else b = b xor num
    }
    return intArrayOf(a, b)
}
```

#### How do you count total 1 bits for every number from 0 to n?

DP approach: `countBits[i] = countBits[i shr 1] + (i and 1)`. Time O(n), space O(n).

```kotlin
fun countBits(n: Int): IntArray {
    val result = IntArray(n + 1)
    for (i in 1..n) {
        result[i] = result[i shr 1] + (i and 1)
    }
    return result
}
```

#### What is bit masking for representing subsets?

A bitmask integer where each bit represents inclusion. For n elements, 2^n subsets represented by integers 0 to 2^n - 1.

```kotlin
fun generateSubsets(nums: IntArray): List<List<Int>> {
    val result = mutableListOf<List<Int>>()
    val n = nums.size
    for (mask in 0 until (1 shl n)) {
        val subset = mutableListOf<Int>()
        for (i in 0 until n) {
            if ((mask shr i) and 1 == 1) subset.add(nums[i])
        }
        result.add(subset)
    }
    return result
}
```

#### How do you compute GCD using Euclid's algorithm?

GCD(a, b) = GCD(b, a % b). Keep reducing until b becomes zero. Time O(log(min(a, b))).

```kotlin
fun gcd(a: Int, b: Int): Int {
    var x = a
    var y = b
    while (y != 0) {
        val temp = y
        y = x % y
        x = temp
    }
    return x
}

fun lcm(a: Int, b: Int): Int = a / gcd(a, b) * b
```

#### How does the Sieve of Eratosthenes work?

Mark all indices as prime. Starting from 2, mark all multiples as not prime. Start marking from p^2 since smaller multiples were handled. Time O(n log log n).

```kotlin
fun sieveOfEratosthenes(n: Int): List<Int> {
    val isPrime = BooleanArray(n + 1) { it >= 2 }
    var i = 2
    while (i * i <= n) {
        if (isPrime[i]) {
            var j = i * i
            while (j <= n) {
                isPrime[j] = false
                j += i
            }
        }
        i++
    }
    return (2..n).filter { isPrime[it] }
}
```

#### How do you reverse the bits of a 32-bit integer?

Extract each bit, shift result left, OR the bit in.

```kotlin
fun reverseBits(n: Int): Int {
    var input = n
    var result = 0
    for (i in 0 until 32) {
        result = (result shl 1) or (input and 1)
        input = input shr 1
    }
    return result
}
```

#### How do you find the Hamming distance between two integers?

XOR them — result has 1s where they differ. Count the set bits.

```kotlin
fun hammingDistance(x: Int, y: Int): Int {
    var xor = x xor y
    var count = 0
    while (xor != 0) {
        xor = xor and (xor - 1)
        count++
    }
    return count
}
```

#### How do you add two integers without + or - operators?

XOR gives sum without carries. AND + left shift gives carry. Repeat until no carry.

```kotlin
fun getSum(a: Int, b: Int): Int {
    var x = a
    var y = b
    while (y != 0) {
        val carry = x and y
        x = x xor y
        y = carry shl 1
    }
    return x
}
```

#### How do you compute a^b mod m efficiently?

Binary exponentiation — square the base and halve the exponent. If odd, multiply result by base. Time O(log b).

```kotlin
fun modPow(base: Long, exp: Long, mod: Long): Long {
    var result = 1L
    var b = base % mod
    var e = exp
    while (e > 0) {
        if (e % 2 == 1L) result = result * b % mod
        b = b * b % mod
        e /= 2
    }
    return result
}
```

#### What is modular arithmetic and why does it matter?

Keeps numbers from overflowing. Common modulus is 10^9 + 7. Key properties: `(a + b) % m = ((a % m) + (b % m)) % m`, same for multiplication. Subtraction needs `+ m` to avoid negatives. Division requires modular inverse.

#### How do you solve "single number" when one number appears once and others appear three times?

Count each bit position across all numbers. If count isn't divisible by 3, that bit belongs to the unique number.

```kotlin
fun singleNumberII(nums: IntArray): Int {
    var result = 0
    for (bit in 0 until 32) {
        var count = 0
        for (num in nums) {
            if ((num shr bit) and 1 == 1) count++
        }
        if (count % 3 != 0) result = result or (1 shl bit)
    }
    return result
}
```

### Common Follow-ups

- How do you swap two numbers using XOR?
- What's the difference between arithmetic and logical right shift?
- How do you check if two integers have opposite signs using XOR?
- What's the time complexity of the Sieve and why isn't it O(n^2)?
- How does bitmask DP work for traveling salesman?
- How do you find the only number appearing an odd number of times?
- Can you solve single number III without bit counting per position?
