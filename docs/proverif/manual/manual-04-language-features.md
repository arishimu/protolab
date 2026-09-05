# Chapter 4: Language features

In the previous chapter, the basic features of the language were introduced; we will now provide a more complete coverage of the language features. These features will be used in Chapter 5 to study the Needham-Schroeder public key protocol as a case study. More advanced features of the language will be discussed in Chapter 6 and the complete input grammar is presented in Appendix A for reference; the features presented in this chapter should be sufficient for most users.

## 4.1 Primitives and modeling features

In Section 3.1.1, we introduced the basic components of the declarations of the language and how to model processes; this section will develop our earlier presentation.

### 4.1.1 Constants

A constant may be defined as a function of arity 0, for example `fun c() : t.` ProVerif also provides a specific construct for constants:

```proverif
const c:t.
```

where `c` is the name of the constant and `t` is its type. Several constants of the same type `t` can be declared by

```proverif
const c1,...,ck : t.
```

### 4.1.2 Data constructors and type conversion

Constructors `fun f(t1,...,tn) : t.` may be declared as items of data by appending `[data]`, that is,

```proverif
fun f(t1,...,tn) : t [data].
```

A constructor declared as data is similar to a tuple: the attacker can construct and decompose data constructors. In other words, declaring a data constructor `f` as above implicitly declares `n` destructors that map `f(x1,...,xn)` to `xi`, where `i ∈ {1,...,n}`. One can inverse a data constructor by pattern-matching: the pattern `f(T1,...,Tn)` is added as pattern in the grammar of Figure 3.3. The type of `T1,...,Tn` is the type of the arguments of `f`, so when `Ti` is a variable, its type can be omitted. For example, with the declarations

```proverif
type key.
type host.
fun keyhost(key, host): bitstring [data].
```

we can write

```proverif
let keyhost(k,h) = x in ...
```

Constructors declared data cannot be declared private.

One application of data constructors is type conversion. As discussed in Section 3.1.1, the type system occasionally makes it difficult to apply functions to arguments due to type mismatches. This can be overcome with type conversion. A type converter is simply a special type of data constructor defined as follows:

```proverif
fun tc(t) : t' [typeConverter].
```

where the type converter `tc` takes input of type `t` and returns a result of type `t'`. Observe that, since the constructor is a data constructor, the attacker may recover term `M` from the term `tc(M)`. Intuitively, the keyword `typeConverter` means that the function is the identity function, and so has no effect except changing the type. By default, types are used for typechecking the protocol but during protocol verification, ProVerif ignores types. The `typeConverter` functions are thus removed. (This behavior allows ProVerif to detect type flaw attacks, in which the attacker mixes data of different types. This behavior can be changed by the setting `set ignoreTypes = ...` as discussed in Section 6.6.2.)

The reverse type conversion, from `t'` to `t`, should be performed by pattern-matching:

```proverif
let tc(x) = M in ...
```

where `M` is of type `t'` and `x` is of type `t`. This construct is allowed since type converters are data constructors. When one defines a type converter `tc(t) : t'` from type `t` to `t'`, all elements of type `t` can be converted to type `t'`, but the only elements of type `t'` that can be converted to type `t` are the elements of the form `tc(M)`. Hence, for instance, it is reasonable to define a type converter from a type `key` representing 128-bit keys to type `bitstring`, but not in the other direction, since all 128-bit keys are bitstrings but only some bitstrings are 128-bit keys.

### 4.1.3 Natural numbers

Natural numbers are natively supported and have the built-in type `nat`. Internally, ProVerif models natural numbers following the Peano axioms, that is, it considers a constant `0` of type `nat` and a data constructor for successor. As such, all natural numbers are terms and can be used with other user-defined functions. A term is said to be a natural number if it is the constant `0` or the application of the successor to a natural number. The grammar of terms (Figure 3.2) is extended in Figure 4.1 to consider the built-in infix functions manipulating natural numbers.

**Figure 4.1 — Natural number grammar.**

```proverif
M,N ::=                                    terms
   ...
   i                                       natural number (i ∈ N)
   M+i                                     addition (i ∈ N)
   i + M                                   addition (i ∈ N)
   M-i                                     subtraction (i ∈ N)
   M>N                                     greater
   M<N                                     smaller
   M>=N                                    greater or equal
   M<=N                                    smaller or equal
```

Finally, ProVerif has a built-in boolean function `is nat` checking whether a term is a natural number or not, that is, `is nat(M)` returns `true` if and only if `M` is equal modulo the equational theory to a natural number.

Note that addition between two arbitrary terms is not allowed. The order relations `>, <, >=, <=` are internally represented by boolean destructor functions that compare the value of two natural numbers. As such, `M > N` returns `true` (resp. `false`) if `M` and `N` are both natural numbers and `M` is strictly greater than (resp. smaller or equal to) `N`. Note that `M > N` fails if `M` or `N` is not a natural number. Similarly, the subtraction is internally represented by a destructor function and for instance, `M - i` fails if `M` is a natural number strictly smaller than `i`. It corresponds to the fact that negative numbers are not allowed in ProVerif.

**Restrictions.** Since natural numbers are represented with a constant `0` and a data constructor `successor`, the attacker can generate all natural numbers. Therefore, ProVerif does not allow the declaration of new names with the type `nat`, i.e., `new k:nat`, since it would allow a process to generate a term declared as a natural number but that does not satisfy the Peano axioms. Similarly, user defined constructors cannot have `nat` as their return type. However, this restriction does not apply to destructors. Finally, all functions can have `nat` as argument type. For example, the following declarations and process are allowed.

```proverif
1  type key.
2
3  free c:channel.
4
5  free s: bitstring [private].
6
7  fun ienc(nat, key): bitstring.
8  fun idec(bitstring, key): nat
9  reduc forall x:nat, y:key; idec(ienc(x+1,y),y) = x.
10
11 query attacker(s).
12
13 process
14    new k:key; (
15        out(c, ienc(2,k))
16        | in(c,x:nat); in(c,y: bitstring); if x + 3 > idec(y,k) then out(c,s)
17    )
```

The function `idec` is allowed to have `nat` as return type as it is declared as a destructor. In this example, the query is false since the attacker can obtain `s` by inputting any natural number for `x`. Note that the test `if x + 3 > idec(y,k) then ...` is not equivalent to `if x > idec(y,k) - 3 then ...`. Indeed, in the latter, ProVerif first evaluates the terms `x` and `idec(y,k) - 3` before comparing their values. In our example, `idec(y,k) - 3` will always fail since the only case where the evaluation of `idec(y,k)` would not fail is when `y` is equal to `ienc(2,k)`. In such a case, `idec(y,k)` would be evaluated to 1 but then the evaluation of `1 - 3` would fail. Hence, the query `attacker(s)` is true for the following process:

```proverif
1  process
2     new k:key; (
3         out(c, ienc(2,k))
4         | in(c,x:nat); in(c,y: bitstring); if x > idec(y,k) - 3 then out(c,s)
5     )
```

### 4.1.4 Enriched terms

For greater flexibility, we redefine our grammar for terms (Figures 3.2 and 4.1) to include restrictions, conditionals, and term evaluations as presented in Figure 4.2. The behavior of enriched terms will now be discussed. Names, variables, tuples, and constructor/destructor application are defined as standard. The term `new a : t; M` constructs a new name `a` of type `t` and then evaluates the enriched term `M`. The term `if M then N else N'` is defined as `N` if the condition `M` is equal to `true` and `N'` when `M` does not fail but is not equal to `true`. If `M` fails, or the else branch is omitted and `M` is not equal to `true`, then the term `if M then N else N'` fails (like when no rewrite rule matches in the evaluation of a destructor). Similarly, `let T = M in N else N'` is defined as `N` if the pattern `T` is matched by `M`, and the variables of `T` are bound by this pattern-matching. As before, if the pattern is not matched, then the enriched term is defined as `N'`; and when the else branch is omitted, the term fails. The term `event e(M1,...,Mn); M` executes the event `e(M1,...,Mn)` and then evaluates the enriched term `M`. The use of enriched terms will be demonstrated in the Needham-Schroeder case study in Section 5.3.

#### ProVerif's internal encoding for enriched terms

Enriched terms are a convenient tool for the end user; internally, ProVerif handles such constructs by encoding them: the conditional `if M then N else N'` is encoded as a special destructor also displayed as `if M then N else N'`; the restriction `new a : t; M` is expanded into a process; the term evaluation `let T = M in N else N'` is encoded as a mix of processes and special destructors. As an example, let us consider the following process.

**Figure 4.2 — Enriched terms grammar.**

```proverif
M,N ::=                                       enriched terms
     a,b,c,k,m,n,s                            names
     x,y,z                                    variables
     (M1,...,Mj)                              tuple
     h(M1,...,Mj)                             constructor/destructor application
     i                                        natural number (i ∈ N)
     M+i                                      addition (i ∈ N)
     i + M                                    addition (i ∈ N)
     M-i                                      subtraction (i ∈ N)
     M>N                                      greater
     M<N                                      smaller
     M>=N                                     greater or equal
     M<=N                                     smaller or equal
     M=N                                      term equality
     M<>N                                     term disequality
     M&&M                                     conjunction
     M||M                                     disjunction
     not(M)                                   negation
     new a:t; M                               name restriction
     if M then N else N'                      conditional
     let T = M in N else N'                   term evaluation
     event e(M1,...,Mn); M                    event
```

```proverif
1  free c:channel.
2
3  free A: bitstring.
4  free B: bitstring.
5
6  process
7      in(c, (x: bitstring, y: bitstring));
8      if x = A || x = B then
9      let z = (if y = A then new n: bitstring; (x,n) else (x,y)) in
10     out(c,z)
```

The process takes as input a pair of bitstrings `x,y` and checks that either `x=A` or `x=B`. The term evaluation `let z = (if y = A then new n:bitstring; (x,n) else (x,y)) in` is defined using the enriched term `if y = A then new n:bitstring; (x,n) else (x,y)` which evaluates to the tuple `(x,n)` where `n` is a new name of type `bitstring` if `y=A`; or `(x,y)` otherwise. (Note that brackets have only been added for readability.) Internally, ProVerif encodes the above main process as:

```proverif
1  in(c, (x: bitstring, y: bitstring));
2  if ((x = A) || (x = B)) then
3  new n: bitstring;
4  let z: bitstring = (if (y = A) then (x,n) else (x,y)) in
5  out(c, z)
```

This encoding sometimes has visible consequences on the behavior of ProVerif. Note that this process was obtained by beautifying the output produced by ProVerif (see Section 3.3 for details on ProVerif output).

### 4.1.5 Tables and key distribution

ProVerif provides tables (or databases) for persistent storage. Tables must be specified in the declarations in the following form:

```proverif
table d(t1,...,tn).
```

where `d` is the name of the table which takes records of type `t1,...,tn`. Processes may populate and access tables, but deletion is forbidden. Note that tables are not accessible by the attacker. Accordingly, the grammar for processes is extended:

```proverif
insert d(M1,...,Mn); P                       insert record
get d(T1,...,Tn) in P else Q                 read record
get d(T1,...,Tn) suchthat M in P else Q      read record
```

The process `insert d(M1,...,Mn); P` inserts the record `M1,...,Mn` into the table `d` and then executes `P`; when `P` is the `0` process, it may be omitted. The process `get d(T1,...,Tn) in P else Q` attempts to retrieve a record in accordance with patterns `T1,...,Tn`. When several records can be matched, one possibility is chosen (but ProVerif considers all possibilities when reasoning) and the process `P` is evaluated with the free variables of `T1,...,Tn` bound inside `P`. When no such record is found, the process `Q` is executed. The `else` branch can be omitted; in this case, when no suitable record is found, the process blocks. The `get` process also has a richer form `get d(T1,...,Tn) suchthat M in P else Q`; in this case, the retrieved record is required to satisfy the condition `M` in addition to matching the patterns `T1,...,Tn`. The grammar for enriched terms is extended similarly:

```proverif
insert d(M1,...,Mn); M                       insert record
get d(T1,...,Tn) in N else N'                read record
get d(T1,...,Tn) suchthat M in N else N'     read record
```

When the `else` branch of `get` is omitted in an enriched term, it is equivalent to `else fail`.

The use of tables for key management will be demonstrated in the Needham-Schroeder public key protocol case study (Chapter 5).

As a side remark, tables can be encoded using private channels. We provide a specific construct since it is frequently used, it can be analyzed precisely by ProVerif (more precisely than some other uses of private channels), and it is probably easier to understand for users that are not used to the pi calculus.

### 4.1.6 Phases

Many protocols can be broken into phases, and their security properties can be formulated in terms of these phases. Typically, for instance, if a protocol discloses a session key after the conclusion of a session, then the secrecy of the data exchanged during that session may be compromised but not its authenticity. To enable modeling of protocols with several phases the syntax for processes is supplemented with a phase prefix `phase t; P`, where `t` is a positive integer. Observe that all processes are under phase 0 by default and hence the instruction `phase 0` is not allowed. Intuitively, `t` represents a global clock, and the process `phase t; P` is active only during phase `t`. A process with phases is executed as follows. First, all instructions under phase 0 are executed, that is, all instructions not under phase `i ≥ 1`. Then, during a stage transition from phase 0 to phase 1, all processes which have not yet reached phase `i ≥ 1` are discarded and the process may then execute instructions under phase 1, but not under phase `i ≥ 2`. More generally, when changing from phase `n` to phase `n + 1`, all processes which have not reached a phase `i ≥ n + 1` are discarded and instructions under phase `n + 1`, but not for phase `i ≥ n + 2`, are executed. It follows from our description that it is not necessary for all instructions of a particular phase to be executed prior to phase transition. Moreover, processes may communicate only if they are under the same phase.

Phases can be used, for example, to prove forward secrecy properties: the goal is to show that, even if some participants get corrupted (so their secret keys are leaked to the attacker), the secrets exchanged in sessions that took place before the corruption are preserved. Corruption can be modeled in ProVerif by outputting the secret keys of the corrupted participants in phase 1; the secrets of the sessions run in phase 0 should be preserved. This is done for the fixed handshake protocol of the previous chapter in the following example (file `docs/ex handshake forward secrecy skB.pv`):

```proverif
1  free c:channel.
2
3  free s: bitstring [private].
4  query attacker(s).
5
6  let clientA(pkA:pkey,skA:skey, pkB:spkey) =
7     out(c,pkA);
8     in(c,x: bitstring);
9     let y = adec(x,skA) in
10    let (=pkA,=pkB,k:key) = checksign(y,pkB) in
11    out(c,senc(s,k)).
12
13 let serverB(pkB:spkey, skB:sskey, pkA:pkey) =
14    in(c,pkX:pkey);
15    new k:key;
16    out(c,aenc(sign((pkX,pkB,k),skB),pkX));
17    in(c,x: bitstring);
18    let z = sdec(x,k).
19
20 process
21   new skA:skey;
22   new skB:sskey;
23   let pkA = pk(skA) in out(c,pkA);
24   let pkB = spk(skB) in out(c,pkB);
25   ( (! clientA(pkA,skA,pkB)) | (! serverB(pkB,skB,pkA)) |
26   phase 1; out(c, skB) )
```

The secret key `skB` of the server `B` is leaked in phase 1 (last line). The secrecy of `s` is still preserved in this example: the attacker can impersonate `B` in phase 1, but cannot decrypt messages of sessions run in phase 0. (Note that one could hope for a stronger model: this model does not consider sessions that are running precisely when the key is leaked. While the attacker can simulate `B` in phase 1, the model above does not run `A` in phase 1; one could easily add a model of `A` in phase 1 if desired.) In contrast, if the secret key of the client `A` is leaked, then the secrecy of `s` is not preserved: the attacker can decrypt the messages of previous sessions by using `skA`, and thus obtain `s`.

### 4.1.7 Synchronization

The synchronization command `sync t [tag]` introduces a global synchronization [BS16], which has some similarity with phases.

The synchronization level `t` must be a positive integer. Synchronizations `sync t` cannot occur under replications. Synchronizations with the same level `t` and the same tag `tag` are considered as the "same synchronization", that is, synchronizations with the same level `t` and the same tag `tag` are allowed only in different branches of `if`, `let`, `let ... suchthat`, `get`. Since only one of these branches will be executed at runtime, at most one synchronization with a given level `t` and tag `tag` can be reached.

The global synchronizations must be executed in increasing order of level `t`. The process waits until `sync t` commands with all existing tags at level `t` are reached before executing the synchronization `t`. More precisely, assuming `t` is the smallest synchronization level that occurs in the initial process and has not been executed yet, if the initial process contains commands `sync t` with tags `tag1, ..., tagn`, then the process waits until it reaches exactly commands `sync t` with tags `tag1, ..., tagn`, then it executes the synchronization `t` and continues after the `sync t` commands. So, in contrast to phases, processes are never discarded by synchronization, but the process may block in case some synchronizations cannot be reached or are discarded for instance by a test that fails above them.

The tags of synchronizations are determined as follows:

- The user can specify the tag of the synchronization by writing `sync t [tag]`. When the user omits the tag and just writes `sync t`, ProVerif gives it a fresh tag.
- When a synchronization occurs inside a process macro and the process macro is expanded, a tag prefix is added to all synchronizations inside the process macro. The prefix `p` is specified by writing `[sync: tag prefix p]` at the expansion of the process macro. For instance:

```proverif
let P(x: bitstring) =
       sync 1 [T];
       out(c,x).

process
       P(a) [sync: tag prefix T1] | P(b) [sync: tag prefix T2]
```

yields the process

```proverif
sync 1 [T1_T]; out(c,a) | sync 1 [T2_T]; out(c,b)
```

(The prefix is separated from the tag by an underscore.) When the indication `[sync: tag prefix p]` is omitted, ProVerif chooses a fresh prefix. One can tell ProVerif not to add a prefix, that is, leave the tags of synchronizations unchanged, by writing `[sync: no tag prefix]` instead of `[sync: tag prefix p]`.

Therefore, when all tags of synchronizations and tag prefixes of process macros are omitted, all synchronizations in the resulting process have distinct tags. This is suitable when these synchronizations occur in parallel processes.

When synchronizations occur in branches of tests, one typically wants them to have the same tag (because otherwise the synchronization would block). So one would write for instance

```proverif
if ... then (... sync 1 [T]; ...) else (... sync 1 [T]; ...)
```

or

```proverif
if ... then (... P(...) [sync: tag prefix T])
        else (... P(...) [sync: tag prefix T])
```

Synchronizations cannot be used with phases. Synchronizations are implemented in ProVerif by translating them into outputs and inputs; the translated process is displayed by ProVerif. Further discussion of synchronization with an example can be found in Section 4.3.2, page 62.

## 4.2 Further cryptographic operators

In Section 3.1.1, we introduced how to model the relationships between cryptographic operations and in Section 3.1.2 we considered the formalization of basic cryptographic primitives needed to model the handshake protocol. This section will consider more advanced formalisms and provide a small library of cryptographic primitives.

### 4.2.1 Extended destructors

We introduce an extended way to define the behaviour of destructors [CB13].

```proverif
fun g(t1,...,tk) : t
reduc forall x1,1 : t1,1, . . . , x1,n1 : t1,n1; g(M1,1,...,M1,k) = M1,0
   otherwise ...
   otherwise forall xm,1 : tm,1, . . . , xm,nm : tm,nm; g(Mm,1,...,Mm,k) = Mm,0.
```

This declaration should be seen as a sequence of rewrite rules rather than as a set of rewrite rules. Thus, when the term `g(N1,...,Nn)` is encountered, ProVerif will try to apply the first rewrite rule of the sequence, `forall x1,1 : t1,1, . . . , x1,n1 : t1,n1; g(M1,1,...,M1,k) = M1,0`. If this rewrite rule is applicable, then the term `g(N1,...,Nn)` is reduced according to that rewrite rule. Otherwise, ProVerif tries the second rewrite rule of the sequence and so on. If no rule can be applied, the destructor fails. This definition of destructors allows one to define new destructors that could not be defined with the definition of Section 3.1.1.

```proverif
1  fun eq(bitstring, bitstring): bool
2     reduc forall x: bitstring; eq(x,x) = true
3     otherwise forall x: bitstring, y: bitstring; eq(x,y) = false.
```

With this definition, `eq(M,N)` can be reduced to `false` only if `M` and `N` are different modulo the equational theory.

As previously mentioned, when no rule can be applied, the destructor fails. However, this formalism does not allow a destructor to succeed when one of its arguments fails. To lift this restriction, we allow to represent the case of failure by the special value `fail`.

```proverif
8  fun test(bool, bitstring, bitstring): bitstring
9  reduc
10    forall x: bitstring, y: bitstring; test(true, x, y) = x
11    otherwise forall c: bool, x: bitstring, y: bitstring; test(c,x,y) = y
12    otherwise forall x: bitstring, y: bitstring; test(fail, x, y) = y.
```

In the previous example, the function `test` returns the third argument even when the first argument fails. A variable `x` of type `t` can be declared as a possible failure by the syntax: `x:t or fail`. It indicates that `x` can be any message or even the special value `fail`. Relying on this new declaration of variables, the destructor `test` could have been defined as follows:

```proverif
14 fun test(bool, bitstring, bitstring): bitstring
15 reduc
16    forall x: bitstring, y: bitstring; test(true, x, y) = x
17    otherwise forall c: bool or fail, x: bitstring, y: bitstring;
18      test(c,x,y) = y.
```

A variant of this test destructor is the following one:

```proverif
20 fun test'(bool, bitstring, bitstring): bitstring
21 reduc
22    forall x: bitstring or fail, y: bitstring or fail; test'(true, x, y) = x
23    otherwise forall c: bool, x: bitstring or fail, y: bitstring or fail;
24      test'(c,x,y) = y.
```

This destructor returns its second argument when the first argument `c` is `true`, its third argument when the first argument `c` does not fail but is not `true`, and fails otherwise. With this definition, when the first argument is `true`, `test'` returns the second argument even when the third argument fails (which models that the third argument does not need to be evaluated in this case). Symmetrically, when the first argument does not fail but is not `true`, `test'` returns the third argument even when the second argument fails. In contrast, the previous destructor `test` fails when its second or third arguments fail.

It is also possible to transform the special failure value `fail` into a non-failure value `c0` by a destructor:

```proverif
27 const c0: bitstring.
28 fun catchfail(bitstring): bitstring
29 reduc
30    forall x: bitstring; catchfail(x) = x
31    otherwise catchfail(fail) = c0.
```

Such a destructor is used internally by ProVerif.

#### Let bindings

Similarly to the simple way of defining destructors (see Section 3.1.1), it is possible to use let bindings within the declaration of each rewrite rule.

### 4.2.2 Equations

Certain cryptographic primitives, such as the Diffie-Hellman key agreement, cannot be encoded as destructors, because they require algebraic relations between terms. Accordingly, ProVerif provides an alternative model for cryptographic primitives, namely equations. The relationships between constructors are captured using equations of the form

```proverif
equation forall x1 : t1,...,xn : tn; M = N.
```

where `M, N` are terms built from the application of (defined) constructor symbols to the variables `x1,...,xn` of type `t1,...,tn`. Note that when no variables are required (that is, when terms `M,N` are constants) `forall x1 : t1,...,xn : tn;` may be omitted.

More generally, one can declare several equations at once, as follows:

```proverif
equation forall x1,1 : t1,1, . . . , x1,n1 : t1,n1; M1 = N1;
   ...
   forall xm,1 : tm,1, . . . , xm,nm : tm,nm; Mm = Nm option.
```

where `option` can either be empty, `[convergent]`, or `[linear]`. When an option `[convergent]` or `[linear]` is present, it means that the group of equations is convergent (the equations, oriented from left to right, form a convergent rewrite system) or linear (each variable occurs at most once in the left-hand and once in the right-hand side of each equation), respectively. In this case, this group of equations must use function symbols that appear in no other equation. ProVerif checks that the convergent or linear option is correct. However, in case ProVerif cannot prove termination of the rewrite system associated to equations declared `[convergent]`, it just displays a warning, and continues assuming that the rewrite system terminates. Indeed, ProVerif's algorithm for proving termination is obviously not complete, so the rewrite system may terminate and ProVerif not be able to prove it. The main interest of the `[convergent]` option is then to bypass the verification of termination of the rewrite system.

#### Let bindings

Similarly to destructors, it is possible to use let bindings within the declaration of each equation.

#### Performance

It should be noted that destructors are more efficient than equations. The use of destructors is therefore advocated where possible.

#### Limitations

ProVerif does not support all equations. It must be possible to split the set of equations into two kinds of equations that do not share constructor symbols: convergent equations and linear equations. Convergent equations are equations that, when oriented from left to right, form a convergent (that is, terminating and confluent) rewriting system. Linear equations are equations such that each variable occurs at most once in the left-hand side and at most once in the right-hand side. When ProVerif cannot split the equations into convergent equations and linear equations, an error message is displayed.

Moreover, even when the equations can be split as above, it may happen that the pre-treatment of equations by ProVerif does not terminate. Essentially, ProVerif computes rewrite rules that encode the equations and it requires that, when `M1,...,Mn` are in normal form, the normal form of `f(M1,...,Mn)` can be computed by a single rewrite step. For some equations, this constraint implies generating an infinite number of rewrite rules, so in this case ProVerif does not terminate. For instance, associativity cannot be handled by ProVerif for this reason, which prevents the modeling of primitives such as XOR (exclusive or) or groups. Another example that leads to non-termination for the same reason is the equation `f(g(x)) = g(f(x))`. In the obtained rewrite rules, all variables that occur in the right-hand side must also occur in the left-hand side.

It is also worth noting that, because ProVerif orients equations from left to right when it builds the rewrite system, the orientation in which the equations are written may influence the success or failure of ProVerif (even if the semantics of the equation obviously does not depend on the orientation). Informally, the equations should be written with the most complex term on the left and the simplest one on the right.

Even with these limitations, many practical primitives can be modeled by equations in ProVerif, as illustrated below.

#### Diffie-Hellman key agreement

The Diffie-Hellman key agreement relies on modular exponentiation in a cyclic group `G` of prime order `q`; let `g` be a generator of `G`. A principal `A` chooses a random exponent `a` in `Z*q`, and sends `g^a` to `B`. Similarly, `B` chooses a random exponent `b`, and sends `g^b` to `A`. Then `A` computes `(g^b)^a` and `B` computes `(g^a)^b`. These two keys are equal, since `(g^b)^a = (g^a)^b`, and cannot be obtained by a passive attacker who has `g^a` and `g^b` but neither `a` nor `b`.

We model the Diffie-Hellman key agreement as follows:

```proverif
1  type G.
2  type exponent.
3
4  const g: G [data].
5  fun exp(G, exponent): G.
6
7  equation forall x: exponent, y: exponent; exp(exp(g,x),y) = exp(exp(g,y),x).
```

The elements of `G` have type `G`, the exponents have type `exponent`, `g` is the generator `g`, and `exp` models modular exponentiation `exp(x,y) = x^y`. The equation means that `(g^x)^y = (g^y)^x`.

This model of Diffie-Hellman key agreement is limited in that it just takes into account the equation needed for the protocol to work, while there exist other equations, coming from the multiplicative group `Z*q`. A more complete model is out of scope of the current treatment of equations in ProVerif, because it requires an associative function symbol, but extensions have been proposed to handle it [KT09].

#### Symmetric encryption

We model a symmetric encryption scheme for which one cannot distinguish whether decryption succeeds or not. We consider the binary constructors `senc` and `sdec`, the arguments of which are of types `bitstring` and `key`.

```proverif
1  type key.
2
3  fun senc(bitstring, key): bitstring.
4  fun sdec(bitstring, key): bitstring.
```

To model the properties of decryption, we introduce the equations:

```proverif
5  equation forall m: bitstring, k: key; sdec(senc(m,k),k) = m.
6  equation forall m: bitstring, k: key; senc(sdec(m,k),k) = m.
```

where `k` represents the symmetric key and `m` represents the message. The first equation is standard: it expresses that, by decrypting the ciphertext with the correct key, one gets the cleartext. The second equation might seem more surprising. It implies that encryption and decryption are two inverse bijections; it is satisfied by block ciphers, for instance. One can also note that this equation is necessary to make sure that one cannot distinguish whether decryption succeeds or not: without this equation, `sdec(M,k)` succeeds if and only if `senc(sdec(M,k),k) = M`.

#### Trapdoor commitments

As a more involved example, let us consider trapdoor commitments [DDKS17]. Trapdoor commitments are commitments that can be opened to a different value than the one initially committed, using a trapdoor. We represent a trapdoor commitment of message `m` with randomness `r` and trapdoor `td` by `tdcommit(m,r,td)`. The normal opening of the commitment returns the message `m`, so we have the equation

```proverif
open(tdcommit(m,r,td),r) = m
```

To change the message, we use the equation:

```proverif
tdcommit(m2,f(m1,r,td,m2),td) = tdcommit(m1,r,td)
```

These equations, oriented from left to right, are not convergent. We need to complete them to obtain a convergent system, with the following equations:

```proverif
open(tdcommit(m1,r,td),f(m1,r,td,m2)) = m2
f(m1,f(m,r,td,m1),td,m2) = f(m,r,td,m2)
```

These equations are convergent, but ProVerif is unable to show termination, so it fails to handle the equations if they are given separately. We can bypass the termination check by giving the equations together and indicating that they are convergent, as follows:

```proverif
type trapdoor.
type rand.
fun tdcommit(bitstring, rand, trapdoor): bitstring.
fun open(bitstring, rand): bitstring.
fun f(bitstring, rand, trapdoor, bitstring): rand.
equation forall m: bitstring, r: rand, td: trapdoor;
     open(tdcommit(m,r,td),r) = m;
     forall m1: bitstring, m2: bitstring, r: rand, td: trapdoor;
     tdcommit(m2, f(m1,r,td,m2), td) = tdcommit(m1,r,td);
     forall m1: bitstring, m2: bitstring, r: rand, td: trapdoor;
     open(tdcommit(m1,r,td), f(m1,r,td,m2)) = m2;
     forall m: bitstring, m1: bitstring, m2: bitstring, r: rand, td: trapdoor;
     f(m1, f(m,r,td,m1), td, m2) = f(m,r,td,m2) [convergent].
```

ProVerif still displays a warning because it cannot prove that the equations terminate:

```proverif
Warning: the following equations
open(tdcommit(m,r,td),r) = m
tdcommit(m2, f(m1,r7,td8,m2),td8) = tdcommit(m1,r7,td8)
open(tdcommit(m19,r11,td12),f(m19,r11,td12,m210)) = m210
f(m114, f(m13,r16,td17,m114), td17, m215) = f(m13,r16,td17,m215)
are declared convergent. I could not prove termination.
I assume that they really terminate.
Expect problems (such as ProVerif going into a loop) if they do not!
```

but it accepts the equations.

### 4.2.3 Function macros

Sometimes, terms that consist of more than just a constructor or destructor application are repeated many times. ProVerif provides a macro mechanism in order to define a function symbol that represents that term and avoid the repetition. Function macros are defined by the following declaration:

```proverif
letfun f(x1 : t1 [or fail],...,xj : tj [or fail]) = M.
```

where the macro `f` takes arguments `x1,...,xj` of types `t1,...,tj` and evaluates to the enriched term `M` (see Figure 4.2). The type of the function macro `f` is inferred from the type of `M`. The optional `or fail` after the type of each argument allows the user to control the behavior of the function macro in case some of its arguments fail:

- If `or fail` is absent and the argument fails, the function macro fails as well. For instance, with the definitions

```proverif
fun h(): t
reduc h() = fail.
letfun f(x:t) =
   let y = x in c0 else c1.
```

`h()` is `fail` and `f(h())` returns `fail` and `f` never returns `c1`.

- If `or fail` is present and the argument fails, the failure value is passed to the function macro, which may for instance catch it and return some non-failure result. For instance, with the same definition of `h` as above and the following definition of `f`

```proverif
letfun f(x:t or fail) =
   let y = x in c0 else c1.
```

`f(h())` returns `c1`.

Function macros can be used as constructors/destructors `h` in terms (see Figure 4.2). The applicability of function macros will be demonstrated by the following example.

#### Probabilistic asymmetric encryption

Recall that asymmetric cryptography makes use of the unary constructor `pk`, which takes an argument of type `skey` (private key) and returns a `pkey` (public key). Since the constructors of ProVerif always represent deterministic functions, we model probabilistic encryption by considering a constructor that takes the random coins used inside the encryption algorithm as an additional argument, so probabilistic asymmetric encryption is modeled by a ternary constructor `internal aenc`, which takes as arguments a message of type `bitstring`, a public key of type `pkey`, and random coins of type `coins`. When encryption is used properly, the random coins must be freshly chosen at each encryption, so that the encryption of `x` under `y` is modeled by `new r: coins; internal aenc(x,y,r)`. In order to avoid writing this code at each encryption, we can define a function macro `aenc`, which expands to this code, as shown below. Decryption is defined in the usual way.

```proverif
type skey.
type pkey.
type coins.
fun pk(skey): pkey.
fun internal aenc(bitstring, pkey, coins): bitstring.
reduc forall m: bitstring, k:skey, r: coins;
   adec(internal aenc(m,pk(k)),r)=k.
letfun aenc(x: bitstring, y:pkey) = new r: coins; internal aenc(x,y,r).
```

Observe that the use of probabilistic cryptography increases the complexity of the model due to the additional names introduced. This may slow down the analysis process.

### 4.2.4 Process macros with fail

Much like function macros above, process macros may also be declared with arguments of type `t or fail`:

```proverif
let p(x1 : t1 [or fail],...,xj : tj [or fail]) = P.
```

The optional `or fail` after the type of each argument allows the user to control the behavior of the process in case some of its arguments fail:

- If `or fail` is absent and the argument fails, the process blocks. For instance, with the definitions

```proverif
fun h(): t
reduc h() = fail.
let p(x:t) =
    let y = x in out(c, c0) else out(c, c1).
```

`p(h())` does nothing and `p` never outputs `c1`.

- If `or fail` is present and the argument fails, the failure value is passed to the process, which may for instance catch it and continue to run. For instance, with the same definition of `h` as above and the following definition of `p`

```proverif
let p(x:t or fail) =
    let y = x in out(c, c0) else out(c, c1).
```

`p(h())` outputs `c1` on channel `c`.

### 4.2.5 Suitable formalizations of cryptographic primitives

In this section, we present various formalizations of basic cryptographic primitives, and relate them to the assumptions on these primitives. We would like to stress that we make no computational soundness claims: ProVerif relies on the symbolic, Dolev-Yao model of cryptography; its results do not apply to the computational model, at least not directly. If you want to obtain proofs of protocols in the computational model, you should use other tools, for instance CryptoVerif (http://cryptoverif.inria.fr). Still, even in the symbolic model, some formalizations correspond better than others to certain assumptions on primitives. The goal of this section is to help you find the best formalization for your primitives.

#### Hash functions

A hash function is represented as a unary constructor `h` with no associated destructor or equations. The constructor takes as input, and returns, a bitstring. Accordingly, we define:

```proverif
fun h(bitstring): bitstring.
```

The absence of any associated destructor or equational theory captures pre-image resistance, second pre-image resistance and collision resistance properties of cryptographic hash functions. In fact, far stronger properties are ensured: this model of hash functions is close to the random oracle model.

#### Symmetric encryption

The most basic formalization of symmetric encryption is the one based on decryption as a destructor, given in Section 3.1.2. However, formalizations that are closer to practical cryptographic schemes are as follows:

1. For block ciphers, which are deterministic, bijective encryption schemes, a better formalization is the one based on equations and given in Section 4.2.2.
2. Other symmetric encryption schemes are probabilistic. This can be formalized in a way similar to what was presented for probabilistic public-key encryption in Section 4.2.3.

```proverif
type key.
type coins.
fun internal senc(bitstring, key, coins): bitstring.
reduc forall m: bitstring, k:key, r: coins;
         sdec(internal senc(m,k,r),k) = m.
letfun senc(x: bitstring, y:key) = new r: coins; internal senc(x,y,r).
```

As shown in [CHW06], for protocols that do not test equality of ciphertexts, for secrecy and authentication, one can use the simpler, deterministic model of Section 3.1.2. However, for observational equivalence properties, or for protocols that test equality of ciphertexts, using the probabilistic model does make a difference.

Note that these encryption schemes generally leak the length of the cleartext. (The length of the ciphertext depends on the length of the cleartext.) This is not taken into account in this formalization, and generally difficult to take into account in formal protocol provers, because it requires arithmetic manipulations. For some protocols, one can argue that this is not a problem, for example when the length of the messages is fixed in the protocol, so it is a priori known to the attacker. Block ciphers are not concerned by this comment since they encrypt data of fixed length.

Also note that, in this formalization, encryption is authenticated. In this respect, this formalization is close to IND-CPA and INT-CTXT symmetric encryption. So it does not make sense to add a MAC (message authentication code) to such an encryption, as one often does to obtain authenticated encryption from unauthenticated encryption: the MAC is already included in the encryption here. If desired, it is sometimes possible to model malleability properties of some encryption schemes, by adding the appropriate equations. However, it is difficult to model general unauthenticated encryption (IND-CPA encryption) in formal protocol provers.

In this formalization, encryption hides the encryption key. If one wants to model an encryption scheme that does not conceal the key, one can add the following destructor [ABCL09]:

```proverif
reduc forall m: bitstring, k:key, r: coins, m': bitstring, r': coins;
       samekey(internal senc(m,k,r), internal senc(m',k,r')) = true.
```

This destructor allows the attacker to test whether two ciphertexts have been built with the same key. The presence of such a destructor makes no difference for reachability properties (secrecy, correspondences) since it does not enable the attacker to construct terms that it could not construct otherwise. However, it does make a difference for observational equivalence properties. (Note that it would obviously be a serious mistake to give out the encryption key to the attacker, in order to model a scheme that does not conceal the key.)

#### Asymmetric encryption

A basic, deterministic model of asymmetric encryption has been given in Section 3.1.2. However, cryptographically secure asymmetric encryption schemes must be probabilistic. So a better model for asymmetric encryption is the probabilistic one given in Section 4.2.3. As shown in [CHW06], for protocols that do not test equality of ciphertexts, for secrecy and authentication, one can use the simpler, deterministic model of Section 3.1.2. However, for observational equivalence properties, or for protocols that test equality of ciphertexts, using the probabilistic model does make a difference.

It is also possible to model that the encryption leaks the key. Since the encryption key is public, we can do this simply by giving the key to the attacker:

```proverif
reduc forall m: bitstring, pk:pkey, r: coins; getkey(internal aenc(m,pk,r)) = pk.
```

The previous models consider a unary constructor `pk` that computes the public key from the secret key. An alternative (and equivalent) formalism for asymmetric encryption considers the unary constructors `pk'`, `sk'` which take arguments of type `seed'`, to capture the notion of constructing a key pair from some seed.

```proverif
type seed'.
type pkey'.
type skey'.
fun pk'(seed'): pkey'.
fun sk'(seed'): skey'.
fun aenc'(bitstring, pkey'): bitstring.
reduc forall m: bitstring, k:seed'; adec'(aenc'(m,pk'(k)), sk'(k)) = m.
```

The addition of single quotes (') is only for distinction between the different formalizations. We have given here the deterministic version, a probabilistic version is obviously also possible.

#### Digital signatures

The Handbook of Applied Cryptography defines four different classes of digital signature schemes [MvOV96, Figure 11.1], we explain how to model these four classes. Deterministic signatures with message recovery were already modeled in Section 3.1.2. Probabilistic signatures with message recovery can be modeled as follows, using the same ideas as for asymmetric encryption:

```proverif
type sskey.
type spkey.
type scoins.
fun spk(sskey): spkey.
fun internal sign(bitstring, sskey, scoins): bitstring.
reduc forall m: bitstring, k:sskey, r: scoins;
        getmess(internal sign(m,k,r)) = m.
reduc forall m: bitstring, k:sskey, r: scoins;
        checksign(internal sign(m,k,r),spk(k)) = m.
letfun sign(m: bitstring, k: sskey) = new r: scoins; internal sign(m,k,r).
```

There also exist signatures that do not allow message recovery, named digital signatures with appendix in [MvOV96]. Here is a model of such signatures in the deterministic case:

```proverif
type sskey'.
type spkey'.
fun spk'(sskey'): spkey'.
fun sign'(bitstring, sskey'): bitstring.
reduc forall m: bitstring, k:sskey'; checksign'(sign'(m,k),spk'(k),m) = true.
```

For such signatures, the message must be given when verifying the signature, and signature verification just returns `true` when it succeeds. Note that these signatures hide the message as if it were encrypted; this is often a stronger property than desired. If one wants to model that these signatures do not hide the message, then one can reintroduce a destructor that leaks the message:

```proverif
reduc forall m: bitstring, k:sskey'; getmess'(sign'(m,k)) = m.
```

Only the adversary should use this destructor; it may be an overapproximation of the capabilities of the adversary, since the message may not be fully recoverable from the signature. Probabilistic signatures with appendix can also be modeled by combining the models given above.

It is also possible to model that the signature leaks the key. Obviously, we must not leak the secret key, but we can leak the corresponding public key using the following destructor:

```proverif
reduc forall m: bitstring, k:sskey, r: scoins;
    getkey(internal sign(m,k,r)) = spk(k).
```

This model is for probabilistic signatures; it can be straightforwardly adapted to deterministic signatures.

Finally, as for asymmetric encryption, we can also consider unary constructors `pk'`, `sk'` which take arguments of type `seed'`, to capture the notion of constructing a key pair from some seed. We leave the construction of these models to the reader.

#### Message authentication codes

Message authentication codes (MACs) can be formalized by a constructor with no associated destructor or equation, much like a keyed hash function:

```proverif
type mkey.
fun mac(bitstring, mkey): bitstring.
```

This model is strong: it considers the MAC essentially as a random oracle. It is probably the best possible model if the MAC is assumed to be a pseudo-random function (PRF). If the MAC is assumed to be unforgeable (UF-CMA), then one can add a destructor that leaks the MACed message:

```proverif
reduc forall m: bitstring, k:mkey; get message(mac(m,k)) = m.
```

Only the adversary should use this destructor; it may be an overapproximation of the capabilities of the adversary, since the message may not be fully recoverable from the MAC. We also remind the reader that using MACs in conjunction with symmetric encryption is generally useless in ProVerif since the basic encryption is already authenticated.

#### Other primitives

A simple model of Diffie-Hellman key agreements is given in Section 4.2.2, bit-commitment and blind signatures are formalized in [KR05, DKR09], trapdoor commitments are formalized in Section 4.2.2, and non-interactive zero-knowledge proofs are formalized in [BMU08]. Since defining correct models for cryptographic primitives is difficult, we recommend reusing existing definitions, such as the ones given in this manual.

## 4.3 Further security properties

In Section 3.2, the basic security properties that ProVerif is able to prove were introduced. In this section, we generalize our earlier presentation and introduce further security properties.

ProVerif is sound, but not complete. ProVerif's ability to reason with reachability, correspondences, and observational equivalence is sound (sometimes called correct); that is, when ProVerif says that a property is satisfied, then the model really does guarantee that property. However, ProVerif is not complete; that is, ProVerif may not be capable of proving a property that holds. Sources of incompleteness are detailed in Section 6.7.5.

### 4.3.1 Complex correspondence assertions, secrecy, and events

In Section 3.2.2, we demonstrated how to model correspondence assertions of the form: "if an event `e` has been executed, then event `e'` has been previously executed." We will now generalize these assertions considerably. The syntax for correspondence assertions is revised as follows:

```proverif
query x1 : t1,...,xn : tn; q.
```

where the query `q` is constructed by the grammar presented in Figure 4.3, such that all terms appearing in `q` are built by the application of constructors to the variables `x1,...,xn` of types `t1,...,tn` and all events appearing in `q` have been declared with the appropriate type. Equalities as well as disequalities and inequalities that involve time variables are not allowed before an arrow `==>` or alone as single fact in the query. If `q` or a subquery of `q` is of the form `F ==> H` and `H` contains an injective event, then `F` must be an injective event. If `F` is a non-injective event, it is automatically transformed into an injective event by ProVerif. The indication `public vars y1,...,ym`, when present, means that `y1,...,ym` are public, that is, the adversary has read access to them. The identifiers `y1,...,ym` must correspond to bound variables or names inside the considered process. (Variables or names bound inside enriched terms are not allowed because the expansion of terms may modify the conditions under which they are defined.) ProVerif then outputs them on public channels as soon as they are defined, to give their value to the adversary. This is mainly useful for compatibility with CryptoVerif. We will explain the meaning of these queries through many examples.

**Figure 4.3 — Grammar for correspondence assertions.**

```proverif
q ::=                                          query
     cq pv                                     reachability or correspondence
     secret x pv [options]                     secrecy
pv ::=                                         public variables
     (empty)
     public vars y1,...,ym                     public variables
cq ::=                                         reachability or correspondence query
     F1 && ... && Fn                           reachability
     F1 && ... && Fn ==> H                     correspondence
H ::=                                          hypothesis
     F                                          fact
     H && H                                     conjunction
     H || H                                     disjunction
     false                                      constant false
     (F ==> H)                                  nested correspondence
F ::=                                          fact
     M op N                                    constraint with op ∈ {<, <=, >, >=, =, <>}
     is nat(M)                                 natural number
     AF                                         action fact
     AF@t                                       action fact executed at time t
AF ::=                                         action fact
     attacker(M)                               the attacker has M (in any phase)
     attacker(M) phase n                       the attacker has M in phase n
     mess(N,M)                                 M is sent on channel N (in the last phase)
     mess(N,M) phase n                         M is sent on channel N in phase n
     table(d(M1,...,Mn))                       the element M1,...,Mn is in table d (in any phase)
     table(d(M1,...,Mn)) phase n               the element M1,...,Mn is in table d in phase n
     event(e(M1,...,Mn))                       non-injective event
     inj-event(e(M1,...,Mn))                   injective event
```

#### Reachability

This corresponds to the case in which the query `q` is just a fact `F`. Such a query is in fact an abbreviation for `F ==> false`, that is, `not F`. In other words, ProVerif tests whether `F` holds, but returns the following results:

- `RESULT not F is true.` when `F` never holds.
- `RESULT not F is false.` when there exists a trace in which `F` holds, and ProVerif displays such a trace.
- `RESULT not F cannot be proved.` when ProVerif cannot decide either way.

For instance, we have seen `query attacker(M)` before: this query tests the secrecy of the term `M` and ProVerif returns `RESULT not attacker(M) is true.` when `M` is secret, that is, the attacker cannot reconstruct `M`. When phases (see Section 4.1.6) are used, this query returns `RESULT not attacker(M) is true.` when `M` is secret in all phases, or equivalently in the last phase. When `M` contains variables, they must be declared with their type at the beginning of the query, and ProVerif returns `RESULT not attacker(M) is true.` when all instances of `M` are secret.

We can test secrecy in a specific phase `n` by `query attacker(M) phase n.` which returns `RESULT not attacker(M) phase n is true.` when `M` is secret in phase `n`, that is, the attacker cannot reconstruct `M` in phase `n`.

We can also test whether the protocol sends a term `M` on a channel `N` (during the last phase if phases are used) by `query mess(N,M)`. This query returns `RESULT not mess(N,M) is true.` when the message `M` is never sent on channel `N`. We can also specify which phase should be considered by `query mess(N,M) phase n`. This query is intended for use when the channel `N` is private (the attacker does not have it). When the attacker has the channel `N`, this query is equivalent to `query attacker(M)`.

Similarly, we can test whether the element `(M1,...,Mn)` is present in table `d` by `query table(d(M1,...,Mn))`.

ProVerif can also evaluate the reachability of events within a model using the following query:

```proverif
query x1 : t1,...,xn : tn; event(e(M1,...,Mk)).
```

This query returns `RESULT not event(e(M1,...,Mk)) is true.` when the event is not reachable. Such queries are useful for debugging purposes, for example, to detect unreachable branches of a model. With reference to the "Hello World" script (`docs/hello ext.pv`) in Chapter 2, one could examine as to whether the else branch is reachable.

More generally, such a query can be `F1 && ... && Fn`, which is in fact an abbreviation for `F1 && ... && Fn ==> false`, that is, `not (F1 && ... && Fn)`: ProVerif tries to prove that `F1,...,Fn` are not simultaneously reachable. The similar query with `inj-event` instead of `event` is useless: it has the same meaning as the one with `event`. Injective events are useful only for correspondences described below. Equalities, disequalities, and inequalities are not allowed in reachability queries as mentioned above.

#### Basic correspondences

Basic correspondences are queries `q = F1 && ... && Fn ==> H` where `H` does not contain nested correspondences. They mean that, if `F1, ..., Fn` hold, then `H` also holds. We have seen such correspondences in Section 3.2.2. We can extend them to conjunctions and disjunctions of events in `H`. For instance,

```proverif
query event(e0) ==> event(e1) && event(e2).
```

means that, if `e0` has been executed, then `e1` and `e2` have been executed. Similarly,

```proverif
query event(e0) ==> event(e1) || event(e2).
```

means that, if `e0` has been executed, then `e1` or `e2` has been executed. If the correspondence `F ==> H` holds, `F` is an event, and `H` contains events, then the events in `H` must be executed before the event `F` (or at the same time as `F` in case an event in `H` may be equal to `F`). This property is proved by stopping the execution of the process just after the event `F`.

Conjunctions and disjunctions can be combined:

```proverif
query event(e0) ==> event(e1) || (event(e2) && event(e3)).
```

means that, if `e0` has been executed, then either `e1` has been executed, or `e2` and `e3` have been executed. The conjunction has higher priority than the disjunction, but one should use parentheses to disambiguate the expressions. The events can of course have arguments, and can also be injective events. For instance,

```proverif
query inj-event(e0) ==> event(e1) || (inj-event(e2) && event(e3)).
```

means that each execution of `e0` corresponds to either an execution of `e1` (perhaps the same execution of `e1` for different executions of `e0`), or to a distinct execution of `e2` and an execution of `e3`. Note that using `inj-event` or `event` before the arrow `==>` does not change anything, since `event` is automatically changed into `inj-event` before `==>` when there is `inj-event` after the arrow `==>`.

Conjunctions are also allowed before the arrow `==>`. For instance,

```proverif
event(e1(M1)) && ... && event(en(Mn)) ==> H
```

means that, if events `e1(M1)`, ..., `en(Mn)` are executed, then `H` holds. When there are several injective events before the arrow `==>`, the query means that for each tuple of executed injective events before the arrow, there are distinct injective events after the arrow. For instance, the query

```proverif
inj-event(e1) && inj-event(e2) ==> inj-event(e3)
```

requires that if event `e1` is executed `n1` times and event `e2` is executed `n2` times, then event `e3` is executed at least `n1 × n2` times.

Correspondences may also involve the knowledge of the attacker or the messages sent on channels. For instance,

```proverif
query attacker(M) ==> event(e1).
```

means that, when the attacker knows `M`, the event `e1` has been executed. Conversely,

```proverif
query event(e1) ==> attacker(M).
```

means that, when event `e1` has been executed, the attacker knows `M`. (In practice, ProVerif may have more difficulties proving the latter correspondence. Technically, ProVerif needs to conclude `attacker(M)` from facts that occur in the hypothesis of a clause that concludes `event(e1)`; this hypothesis may get simplified during the resolution process in a way that makes the desired facts disappear.)

One may also use equalities, disequalities, and inequalities after the arrow `==>`. For instance, assuming a free name `a`,

```proverif
query x:t; event(e(x)) ==> x = a.
```

means that the event `e(x)` can be executed only when `x` is `a`. Similarly,

```proverif
query x:t, y:t'; event(e(x)) ==> event(e'(y)) && x = f(y)
```

means that, when the event `e(x)` is executed, the event `e'(y)` has been executed and `x = f(y)`. Using disequalities,

```proverif
query x:t; event(e(x)) ==> x <> a.
```

means that the event `e(x)` can be executed only when `x` is different from `a`.

#### Nested correspondences

The grammar permits the construction of nested correspondences, that is, correspondences `F1 && ... && Fn ==> H` in which some of the events `H` are replaced with correspondences. Such correspondences allow us to order events. More precisely, in order to explain a nested correspondence `F1 && ... && Fn ==> H`, let us define a hypothesis `Hs` by replacing all arrows `==>` of `H` with conjunctions `&&`. The nested correspondence `F1 && ... && Fn ==> H` holds if and only if the basic correspondence `F1 && ... && Fn ==> Hs` holds and additionally, for each `F' ==> H'` that occurs in `F1 && ... && Fn ==> H`, if `F'` is an event, then the events of `H'` have been executed before `F'` (or at the same time as `F'` in case events in `H'` may be equal to `F'`). For example,

```proverif
event(e0) ==> (event(e1) ==> (event(e2) ==> event(e3)))
```

is true when, if the event `e0` has been executed, then events `e3, e2, e1` have been previously executed in that order and before `e0`. In contrast, the correspondence

```proverif
event(e0) ==> (event(e1) ==> event(e2)) && (event(e3) ==> event(e4))
```

holds when, if the event `e0` has been executed, then `e2` has been executed before `e1` and `e4` before `e3`, and those occurrences of `e1` and `e3` have been executed before `e0`.

Even if the grammar of correspondences does not explicitly require that facts `F` that occur before arrows in nested correspondences are events (or injective events), in practice they are because the only goal of nested correspondences is to order such events.

Our study of the JFK protocol, which can be found in the subdirectory `examples/pitype/jfk` (if you installed by OPAM in the switch `⟨switch⟩`, the directory `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/jfk`), provides several interesting examples of nested correspondence assertions used to prove the correct ordering of messages of the protocol.

ProVerif proves nested correspondences essentially by proving several correspondences. For instance, in order to prove

```proverif
event(e0) ==> (event(e1) ==> event(e2))
```

where the events `e0, e1, e2` may have arguments, ProVerif proves that each execution of `e0` is preceded by the execution of an instance of `e1`, and that, when `e0` is executed, each execution of that instance of `e1` is preceded by the execution of an instance of `e2`.

A typical usage of nested correspondences is to order all messages in a protocol. One would like to prove a correspondence in the style:

```proverif
inj-event(eend) ==>
    (inj-event(en) ==> ... ==> (inj-event(e1) ==> inj-event(e0)))
```

where `e0` means that the first message of the protocol has been sent, `ei` (i > 0) means that the i-th message of the protocol has been received and the (i + 1)-th has been sent, and finally `eend` means that the last message of the protocol has been received. (These events have at least as arguments the messages of the protocol.)

#### Temporal correspondences

Correspondences and nested correspondences allow one to verify the order in which facts occur in execution traces. The grammar also permits to reason on the order of facts through time variables. In a query, each fact `F` can be associated with a variable `t` of type `time` with the construct `F@t`, meaning that the fact `F` is executed at time `t`. When several facts are associated with time variables `t,t',...,` we can reason on the order in which these facts are executed using equalities, inequalities, and disequalities between the time variables, e.g. `t < t'`, `t = t'`, ... For example, in our study of the Yubikey protocol, which can be found in the file `examples/pitype/lemma/yubikey-less-axioms-time.pv` (if you installed by OPAM in the switch `⟨switch⟩`, the file `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/lemma/yubikey-less-axioms-time.pv`), a server executes the event `Login(pid,k,i,x)` every time it accepts a connection from a Yubikey with identity `pid` and key `k`. The value `i` is the value of the server's counter and `x` is the value of the Yubikey's counter sent to the server. The following query ensures that the server never executes two login events at different times with the same value for the identity, the key, and Yubikey's counter.

```proverif
query t:time, t':time, pid: bitstring, k: bitstring, i:nat, i':nat,
   x:nat, x':nat;
      event(Login(pid,k,i,x))@t && event(Login(pid,k,i',x))@t' ==> t = t'.
```

Formally, the query is true when, if two `Login` events are executed with the same key, identity, and Yubikey's counter value, then the two events are executed at the same time. Since the semantics of ProVerif's calculus only allows events to be executed one at a time, it also implies that the two events are equal, i.e., `i = i'`.

Using temporal correspondences allows one to be more precise than basic correspondences. For example, the following query is not equivalent to the previous one.

```proverif
query pid: bitstring, k: bitstring, i:nat, i':nat, x:nat, x':nat;
     event(Login(pid,k,i,x)) && event(Login(pid,k,i',x)) ==> i = i'.
```

Indeed, an execution trace where the `Login` event is executed twice with the same arguments (at different times) would satisfy this query but not the former one.

Temporal variables can be used to compare facts from both the premise and the conclusion of the query. For example,

```proverif
event(e0) && event(e1)@t1 ==> event(e2)@t2 && t2 < t1
```

is true when if two events `e0` and `e1` are executed then the event `e2` must have been executed strictly before the event `e1`.

Note that temporal variables can be used in combination with injective events and nested correspondences, although they overlap in some cases. For example, the query

```proverif
event(e0) ==> (event(e1) ==> event(e2))
```

is equivalent to the query

```proverif
event(e0) ==> event(e1)@t1 && event(e2)@t2 && t2 <= t1
```

The grammar of correspondences also allows attacker, message, and table facts to be associated with time variables. However, when an inequality `i > j` or `i >= j` occurs in the conclusion of a query, with `i` and `j` time variables associated to facts `F` and `G` respectively, the following two conditions must hold: 1) `F@i` occurs in the premise or `F` is an event; 2) `G@j` occurs in the conclusion or `G` is an event. More generally, in practice, ProVerif is more successful in proving correspondence queries containing mainly events. Note that the type `time` can only be used in queries and cannot be used in declarations of processes, function symbols, names, ...

> **1** Although the meaning of a basic correspondence such as `event(e0) ==> event(e1)` is similar to a logical implication, the meaning of a nested correspondence such as `event(e0) ==> (event(e1) ==> event(e2))` is very different from the logical formula `event(e0) ⇒ (event(e1) ⇒ event(e2))` in classical logic, which would mean `(event(e0) ∧ event(e1)) ⇒ event(e2)`. The nested correspondence `event(e0) ==> (event(e1) ==> event(e2))` rather means that, if `e0` is executed, then some instance of `e1` is executed (before `e0`), and if that instance of `e1` is executed, then an instance of `e2` is executed (before `e1`). So the nested correspondence is similar to an abbreviation for the two correspondences `event(e0) ==> event(σe1)` and `event(σe1) ==> event(σe2)` for some substitution `σ`.

#### Secrecy

The query `query secret x` provides an alternative way to test secrecy to `query attacker(M)`. The latter query is meant to test whether the attacker can compute the term `M`, built from free names. The query `query secret x` can test the secrecy of the bound name or variable `x`. The identifier `x` must correspond to a bound variable or name inside the considered process. (Variables or names bound inside enriched terms are not allowed because the expansion of terms may modify the conditions under which they are defined.) This query comes in two flavors:

- `query secret x`, `query secret x [reachability]`, or `query secret x [pv reachability]` tests whether the attacker can compute a value stored in the variable `x` or equal to the bound name `x`.
- `query secret x [real or random]` or `query secret x [pv real or random]` tests whether the attacker can distinguish each value of `x` from a fresh name (representing a fresh random value). This query is in fact encoded as an observational query between processes that differ only by terms. Such queries are explained in the next section.

This query is designed for compatibility with CryptoVerif: the options that start with `pv` apply only to ProVerif; those that start with `cv` apply only to CryptoVerif and are ignored by ProVerif; the others apply to both tools. The various options make it possible to test, in each tool, whether the attacker can compute the value of `x` or whether it can distinguish it from a fresh random value. (The former is the default in ProVerif while the latter is the default in CryptoVerif.)

### 4.3.2 Observational equivalence

The notion of indistinguishability is a powerful concept which allows us to reason about complex properties that cannot be expressed as reachability or correspondence properties. The notion of indistinguishability is generally named observational equivalence in the formal model. Intuitively, two processes `P` and `Q` are observationally equivalent, written `P ≈ Q`, when an active attacker cannot distinguish `P` from `Q`. Formal definitions can be found in [AF01, BAF08]. Using this notion, one can for instance specify that a process `P` follows its specification `Q` by saying that `P ≈ Q`. ProVerif can prove some observational equivalences, but not all of them because their proof is complex. In this section, we present the queries that enable us to prove observational equivalences using ProVerif.

#### Strong secrecy

A first class of equivalences that ProVerif can prove is strong secrecy. Strong secrecy means that the attacker is unable to distinguish when the secret changes. In other words, the value of the secret should not affect the observable behavior of the protocol. Such a notion is useful to capture the attacker's ability to learn partial information about the secret: when the attacker learns the first component of a pair, for instance, the whole pair is secret in the sense of reachability (the attacker cannot reconstruct the whole pair because it does not have the second component), but it is not secret in the sense of strong secrecy (the attacker can notice changes in the value of the pair, since it has its first component). The concept is particularly important when the secret consists of known values. Consider for instance a process `P` that uses a boolean `b`. The variable `b` can take two values, `true` or `false`, which are both known to the attacker, so it is not secret in the sense of reachability. However, one may express that `b` is strongly secret by saying that `P{true/b} ≈ P{false/b}`: the attacker cannot determine whether `b` is `true` or `false`. (`{true/b}` denotes the substitution that replaces `b` with `true`.)

The strong secrecy of values `x1,...,xn` is denoted by

```proverif
noninterf x1,...,xn.
```

When the process under consideration is `P`, this query is true if and only if

```proverif
P{M1/x1,...,Mn/xn} ≈ P{M'1/x1,...,M'n/xn}
```

for all terms `M1,...,Mn, M'1,...,M'n`. (`{M1/x1,...,Mn/xn}` denotes the substitution that replaces `x1` with `M1`, ..., `xn` with `Mn`.) In other words, the attacker cannot distinguish changes in the values of `x1,...,xn`. The values `x1,...,xn` must be free names of `P`, declared by `free xi : ti [private]`. This point is particularly important: if `x1,...,xn` do not occur in `P` or occur as bound names or variables in `P`, the query `noninterf x1,...,xn` holds trivially, because `P{M1/x1,...,Mn/xn} = P{M'1/x1,...,M'n/xn}`! To express secrecy of bound names or variables, one can use `choice`, described below. In the equivalence above, the attacker is permitted to replace the values `x1,...,xn` with any term `M1,...,Mn, M'1,...,M'n` it can build, that is, any term that can be built from public free names, public constructors, and fresh names created by the attacker. These terms cannot contain bound names (or private free names).

For instance, this strong secrecy query can be used to show the secrecy of a payload sent encrypted under a session key. Here is a trivial example of a such situation, in which we use a previously shared long-term key `k` as session key (file `docs/ex noninterf1.pv`).

```proverif
1  free c: channel.
2
3  (* Shared key encryption *)
4  type key.
5  fun senc(bitstring, key): bitstring.
6  reduc forall x: bitstring, y: key; sdec(senc(x,y),y) = x.
7
8  (* The shared key *)
9  free k:key [private].
10
11 (* Query *)
12 free secret msg: bitstring [private].
13 noninterf secret msg.
14
15 process (!out(c, senc(secret msg, k))) |
16     (! in(c, x: bitstring); let s = sdec(x, k) in 0)
```

One can also specify the set of terms in which `M1,...,Mn, M'1,...,M'n` are taken, using a variant of the `noninterf` query:

```proverif
noninterf x1 among (M1,1,...,M1,k1),
   ...,
   xn among (Mn,1,...,Mn,kn).
```

This query is true if and only if

```proverif
P{M1/x1,...,Mn/xn} ≈ P{M'1/x1,...,M'n/xn}
```

for all terms `M1, M'1 ∈ {M1,1,...,M1,k1}`, ..., `Mn, M'n ∈ {Mn,1,...,Mn,kn}`. Obviously, the terms `Mj,1,...,Mj,kj` must have the same type as `xj`. For instance, the secrecy of a boolean `b` could be expressed by `noninterf b among (true, false)`.

Consider the following example (`docs/ex noninterf2.pv`) in which the attacker is asked to distinguish between sessions which output `x ∈ {n, h(n)}`, where `n` is a private name.

```proverif
1  free c: channel.
2
3  fun h(bitstring): bitstring.
4
5  free x,n: bitstring [private].
6  noninterf x among (n, h(n)).
7
8  process out(c, x)
```

Note that `free x,n: bitstring [private].` is a convenient shorthand for

```proverif
free x: bitstring [private].
free n: bitstring [private].
```

More complex examples can be found in subdirectory `examples/pitype/noninterf` (if you installed by OPAM in the switch `⟨switch⟩`, the directory `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/noninterf`).

#### Off-line guessing attacks

Protocols may rely upon weak secrets, that is, values with low entropy, such as human-memorable passwords. Protocols which rely upon weak secrets are often subject to off-line guessing attacks, whereby an attacker passively observes, or actively participates in, an execution of the protocol and then has the ability to verify if a guessed value is indeed the weak secret without further interaction with the protocol. This makes it possible for the attacker to enumerate a dictionary of passwords, verify each of them, and find the correct one. The absence of off-line guessing attacks against a name `n` can be tested by the query:

```proverif
weaksecret n.
```

where `n` is declared as a private free name: `free n : t [private]`. ProVerif then tries to prove that the attacker cannot distinguish a correct guess of the secret from an incorrect guess. This can be written formally as an observational equivalence

```proverif
P | phase 1; out(c, n) ≈ P | phase 1; new n' :t; out(c, n')
```

where `P` is the process under consideration and `t` is the type of `n`. In phase 0, the attacker interacts with the protocol `P`. In phase 1, the attacker can no longer interact with `P`, but it receives either the correct password `n` or a fresh (incorrect) password `n'`, and it should not be able to distinguish between these two situations.

As an example, we will consider the naïve voting protocol introduced by Delaune & Jacquemard [DJ04]. The protocol proceeds as follows. The voter `V` constructs her ballot by encrypting her vote `v` with the public key of the administrator. The ballot is then sent to the administrator whom is able to decrypt the message and record the voter's vote, as modeled in the file `docs/ex weaksecret.pv` shown below:

```proverif
1  free c: channel.
2
3  type skey.
4  type pkey.
5
6  fun pk(skey): pkey.
7  fun aenc(bitstring, pkey): bitstring.
8
9  reduc forall m: bitstring, k: skey; adec(aenc(m,pk(k)), k) = m.
10
11 free v: bitstring [private].
12 weaksecret v.
13
14 let V(pkA:pkey) = out(c, aenc(v, pkA)).
15
16 let A(skA:skey) = in(c,x: bitstring); let v' = adec(x, skA) in 0.
17
18 process
19    new skA: skey;
20    let pkA = pk(skA) in
21    out(c, pkA);
22    ! (V(pkA) | A(skA))
```

The voter's vote is syntactically secret; however, if the attacker is assumed to know a small set of possible votes, then `v` can be deduced from the ballot. The off-line guessing attack can be thwarted by the use of a probabilistic public-key encryption scheme.

More examples regarding guessing attacks can be found in subdirectory `examples/pitype/weaksecr` (if you installed by OPAM in the switch `⟨switch⟩`, the directory `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/weaksecr`).

#### Observational equivalence between processes that differ only by terms

The most general class of equivalences that ProVerif can prove are equivalences `P ≈ Q` where the processes `P` and `Q` have the same structure and differ only in the choice of terms. These equivalences are written in ProVerif by a single "biprocess" that encodes both `P` and `Q`. Such a biprocess uses the construct `choice[M,M']` to represent the terms that differ between `P` and `Q`: `P` uses the first component of the choice, `M`, while `Q` uses the second one, `M'`. (The keyword `diff` is also allowed as a synonym for `choice`; `diff` is used in research papers.) For example, the secret ballot (privacy) property of an electronic voting protocol can be expressed as:

```proverif
P(skA,v1) | P(skB,v2) ≈ P(skA,v2) | P(skB,v1)       (4.1)
```

where `P` is the voter process, `skA` (respectively `skB`) is the voter's secret key and `v1` (respectively `v2`) is the candidate for whom the voter wishes to vote for: one cannot distinguish the situation in which `A` votes for `v1` and `B` votes from `v2` from the situation in which `A` votes for `v2` and `B` votes for `v1`. (The simpler equivalence `P(skA,v1) ≈ P(skA,v2)` typically does not hold because, if `A` is the only voter, one can know for whom she voted from the final result of the election.) The pair of processes (4.1) can be expressed as a single biprocess as follows:

```proverif
P(skA,choice[v1,v2]) | P(skB,choice[v2,v1])
```

Accordingly, we extend our grammar for terms to include `choice[M,N]`.

Unlike the previous security properties we have studied, there is no need to explicitly tell ProVerif that a script aims at verifying an observational equivalence, since this can be inferred from the occurrence of `choice[M,N]`. It should be noted that the analysis of observational equivalence is incompatible with other security properties, that is, scripts in which `choice[M,N]` appears cannot contain `query`, `noninterf`, nor `weaksecret`. (For this reason, you may have to write several distinct input files in order to prove several properties of the same protocol. You can use a preprocessor such as `m4` or `cpp` to generate all these files from a single master file.)

#### Example: Decisional Diffie-Hellman assumption

The decisional Diffie-Hellman (DDH) assumption states that, given a cyclic group `G` of prime order `q` with generator `g`, `(g^a,g^b,g^ab)` is computationally indistinguishable from `(g^a,g^b,g^c)`, where `a,b,c` are random elements from `Z*q`. A formal counterpart of this property can be expressed as an equivalence using the ProVerif script below (file `docs/dh-fs.pv`).

```proverif
1  free d: channel.
2
3  type G.
4  type exponent.
5
6  const g: G [data].
7  fun exp(G, exponent): G.
8
9  equation forall x: exponent, y: exponent; exp(exp(g,x),y) = exp(exp(g,y),x).
10
11 process
12    new a: exponent; new b: exponent; new c: exponent;
13    out(d, (exp(g,a), exp(g,b), choice[exp(exp(g,a),b), exp(g,c)]))
```

ProVerif succeeds in proving this equivalence. Intuitively, this result shows that our model of the Diffie-Hellman key agreement is stronger than the Decisional Diffie-Hellman assumption.

Observe that the biprocess `out(d, (exp(g,a), exp(g,b), choice[exp(exp(g,a),b), exp(g,c)]))` is equivalent to

```proverif
out(choice[d,d], (choice[exp(g,a),exp(g,a)], choice[exp(g,b),exp(g,b)],
   choice[exp(exp(g,a),b),exp(g,c)])).
```

That is, `choice[M,M]` may be abbreviated as `M`; it follows immediately that the choice operator is only needed to model the terms that are different in the pair of processes.

#### Real-or-random secrecy

In the computational model, one generally expresses the secrecy of a value `x` by saying that `x` is indistinguishable from a fresh random value. One can express a similar idea in the formal model using observational equivalence. For instance, this notion can be used for proving secrecy of a session key `k`, as in the following variant of the fixed handshake protocol of Chapter 3 (file `docs/ex handshake RoR.pv`).

```proverif
1  free c:channel.
2
3  let clientA(pkA:pkey,skA:skey, pkB:spkey) =
4     out(c,pkA);
5     in(c,x: bitstring);
6     let y = adec(x,skA) in
7     let (=pkA,=pkB,k:key) = checksign(y,pkB) in
8     new random:key;
9     out(c, choice[k,random]).
10
11 let serverB(pkB:spkey, skB:sskey, pkA:pkey) =
12    in(c,pkX:pkey);
13    new k:key;
14    out(c,aenc(sign((pkX,pkB,k),skB),pkX)).
15
16 process
17    new skA:skey;
18    new skB:sskey;
19    let pkA = pk(skA) in out(c,pkA);
20    let pkB = spk(skB) in out(c,pkB);
21    ( (! clientA(pkA,skA,pkB)) | (! serverB(pkB,skB,pkA)) )
```

In Line 9, one outputs to the attacker either the real key (`k`) or a random key (`random`), and the equivalence holds when the attacker cannot distinguish these two situations. As ProVerif finds, the equivalence does not hold in this example, because of a replay attack: the attacker can replay the message from the server `B` to the client `A`, which leads several sessions of the client to have the same key `k`. The attacker can distinguish this situation from a situation in which the key is a fresh random number (`random`) generated at each session of the client. Another example can be found in Section 5.4.2.

When the observational equivalence proof fails on the biprocess given by the user, ProVerif tries to simplify that biprocess by transforming as far as possible tests that occur in subprocesses into tests done inside terms, which increases the chances of success of the proof. The proof is then re-tried on the simplified process(es). This simplification of biprocesses can be turned off by the setting `set simplifyProcess = false`. (See Section 6.6.2 for details on this setting.) More complex examples using `choice` can be found in subdirectory `examples/pitype/choice` (if you installed by OPAM in the switch `⟨switch⟩`, the directory `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/choice`).

#### Remarks

The absence of off-line guessing attacks can also be expressed using `choice`:

```proverif
P | phase 1; new n' :t; out(c, choice[n,n'])
```

This is how ProVerif handles guessing attacks internally, but using `weaksecret` is generally more convenient in practice. (For instance, one can query for the secrecy of several weak secrets in the same ProVerif script.)

Strong secrecy `noninterf x1,...,xn` can also be formalized using `choice`, by inputting two messages `x'i, x''i` for each `i ≤ n` and defining `xi` by `let xi = choice[x'i,x''i]` before starting the protocol itself (possibly in an earlier phase than the protocol). However, the query `noninterf` is typically much more efficient than `choice`. On the other hand, in the presence of equations that can be applied to the secrets, `noninterf` commonly leads to false attacks. So we recommend trying with `noninterf` for properties that can be expressed with it, especially when there is no equation, and using `choice` in the presence of equations or for properties that cannot be expressed using `noninterf`.

Strong secrecy with `among` can also be encoded using `choice`. That may require many equivalences when the sets are large, even if some examples are very easy to encode. For instance, the query `noninterf b among (true, false)` can also be encoded as `let b = choice[true, false] in P` where `P` is the protocol under consideration.

Static equivalence [AF01] is an equivalence between frames, that is, substitutions with hidden names

```proverif
ϕ = new n1 : t1; ... new nk : tk; {M1/x1,...,Ml/xl}
ϕ' = new n'1 : t'1; ... new n'k : t'k; {M'1/x'1,...,M'l/x'l}
```

Static equivalence corresponds to the case in which the attacker receives either the messages `M1,...,Ml` or `M'1,...,M'l`, and should not be able to distinguish between these two situations; static equivalence can be expressed by the observational equivalence

```proverif
new n1 : t1; ... new nk : tk; out(c, (M1,...,Ml))
≈ new n'1 : t'1; ... new n'k : t'k; out(c, (M'1,...,M'l))
```

which can always be written using `choice`:

```proverif
new n1 : t1; ... new nk : tk; new n'1 : t'1; ... new n'k : t'k;
   out(c, (choice[M1,M'1], ..., choice[Ml,M'l]))
```

The Diffie-Hellman example above is an example of static equivalence.

Internally, ProVerif proves a property much stronger than observational equivalence of `P` and `Q`. In fact, it shows that for each reachable test, the same branch of the test is taken both in `P` and in `Q`; for each reachable destructor application, the destructor application either succeeds both in `P` and `Q` or fails both in `P` and `Q`; for each reachable configuration with an input and an output on private channels, the channels are equal in `P` and in `Q`, or different in `P` and in `Q`. In other words, it shows that each reduction step is executed in the same way in `P` and `Q`. Because this property is stronger than observational equivalence, we may have "false attacks" in which this property is wrong but observational equivalence in fact holds. When ProVerif does not manage to prove observational equivalence, it tries to reconstruct an attack against the stronger property, that is, it provides a trace of `P` and `Q` that arrives at a point at which `P` and `Q` reduce in a different way. This trace explains why the proof fails, and may also enable the user to understand if observational equivalence really does not hold, but it does not provide a proof that observational equivalence does not hold. That is why ProVerif never concludes `RESULT [Query] is false` for observational equivalences; when the proof fails, it just concludes `RESULT [Query] cannot be proved`.

#### Observational equivalence with synchronizations

Synchronizations (see Section 4.1.7) can help proving equivalences with `choice`, because they allow swapping data between processes at the synchronization points [BS16]. The following toy example illustrates this point:

```proverif
1  free c: channel.
2  free m,n: bitstring.
3
4  process
5         (
6               out(c,m);
7               sync 1;
8               out(c,choice[m,n])
9         )|(
10              sync 1;
11              out(c,choice[n,m])
12        )
```

The two processes represented by this biprocess are observationally equivalent, and this property is proved by swapping `m` and `n` in the second component of `choice` at the synchronization point. By default, ProVerif tries all possible swapping strategies in order to prove the equivalence. It is also possible to choose the swapping strategy in the input file by `set swapping = "swapping stragegy".`, or to choose it interactively by adding `set interactiveSwapping = true.` to the input file. In the latter case, ProVerif displays a description of the possible swappings and asks the user which swapping strategy to choose.

A swapping strategy is described as follows. The swapping strategies are permutations of the synchronizations, represented by their tag (given by the user or chosen automatically by ProVerif as explained in Section 4.1.7; for stability of the tags, when a swapping strategy is given, it is recommended that the user specifies the tags). They are denoted as follows:

```proverif
tag1,1-> ... -> tag1,n1; ...; tagk,1-> ... -> tagk,nk
```

which means that `tagi,j` has image `tagi,j+1` when `j < ni` and `tagi,ni` has image `tagi,1` by the permutation. (In other words, we give the cycles of the permutation.) When the tag of a synchronization does not appear in the swapping strategy, data is not swapped at that synchronization. For instance, the previous example may be rewritten:

```proverif
1  free c: channel.
2  free m,n: bitstring.
3
4  set swapping = "tag1 -> tag2".
5
6  process
7         (
8               out(c,m);
9               sync 1 [tag1];
10              out(c,choice[m,n])
11        )|(
12              sync 1 [tag2];
13              out(c,choice[n,m])
14        )
```

with additional tags, and the swapping strategy is `tag1 -> tag2`.

When a synchronization is tagged with a tag that contains the string `noswap`, data is not swapped at that synchronization.

Swapping data at synchronizations point can help for instance proving ballot secrecy in e-voting protocols: as mentioned above, this property is proved by showing that the two processes represented by the biprocess

```proverif
P(skA,choice[v1,v2]) | P(skB,choice[v2,v1])
```

are observationally equivalent, and proving this property often requires swapping the votes `v1` and `v2`. This technique is illustrated on the FOO e-voting protocol in the file `examples/pitype/sync/foo.pv` of the documentation package `proverifdoc2.05.tar.gz`. Other examples appear in the directory `examples/pitype/sync/` in that package.

#### Observational equivalence between two processes

ProVerif can also prove equivalence `P ≈ Q` between two processes `P` and `Q` presented separately, using the following command (instead of `process P`)

```proverif
equivalence P Q
```

where `P` and `Q` are processes that do not contain `choice`. ProVerif will in fact try to merge the processes `P` and `Q` into a biprocess and then prove equivalence of this biprocess. Note that ProVerif is not always capable of merging two processes into a biprocess: the structure of the two processes must be fairly similar. Here is a toy example:

```proverif
1  type key.
2  type macs.
3
4  fun mac(bitstring, key): macs.
5
6  free c: channel.
7
8  equivalence
9      ! new k:key; ! new a: bitstring; out(c, mac(a, k))
10     ! new k:key; new a: bitstring; out(c, mac(a, k))
```

The difference between the two processes is that the first process can use the same key `k` for sending several MACs, while the second one sends one MAC for each key `k`. Even though the structure of the two processes is slightly different (there is an additional replication in the first process), ProVerif manages to merge these two processes into a single biprocess:

```proverif
1  !
2  new k39: key;
3  !
4  new a40: bitstring;
5  new k41: key;
6  new a42: bitstring;
7  out(c, choice[mac(a40,k39),mac(a42,k41)])
```

and to prove that the two processes are observationally equivalent.

When proving an equivalence by `equivalence P Q`, the processes `P` and `Q` must not contain synchronizations `sync n` (see Section 4.1.7).
