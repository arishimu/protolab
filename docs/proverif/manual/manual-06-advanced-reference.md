# Chapter 6: Advanced reference

This chapter introduces ProVerif's advanced capabilities. We provide the complete grammar in Appendix A.

## 6.1 Proving correspondence queries by induction

### 6.1.1 Single query

Consider a correspondence query `F ==> F′` and a process `P`. As mentioned in Sections 3.2.2 and 4.3.1, to prove that `P` satisfies the query `F ==> F′`, ProVerif needs to show that, for all traces of `P`, if `F` was executed in the trace, then `F′` was also executed in the trace before `F`. Intuitively, proving the query `F ==> F′` by induction consists of proving the above property by induction on the length of the traces of `P`.

To simplify the explanation, let us introduce some informal notations. We consider that a trace of `P` is a sequence of actions `tr = a₁ ... aₙ` representing the actions that have been executed in `P` similarly to the attack traces (see Section 3.3.2). The length of the trace, denoted `|tr|`, corresponds to its number of actions, that is, `n`. Finally, we say that a fact is executed at step `k`, denoted `F,k ⊢ tr` when `F` is the action `aₖ` in `tr`. The induction hypothesis `P(n)` can then be expressed as:

```
for all traces tr of P, if |tr| ≤ n, then for all k, if F,k ⊢ tr then F′,k′ ⊢ tr for some k′ ≤ k.
```

For ProVerif to prove this property by induction, we only need to prove that `P(n)` implies `P(n+1)` for all `n ∈ N`. (Note that `P(0)` is trivially always true.)

By considering a trace `tr = a₁ ... aₙ₊₁` and assuming that `P(n)` holds, we directly obtain that the sub-trace `tr′ = a₁ ... aₙ` satisfies `P(n)`. This yields two interesting properties:

- We can consider that `k = n+1`, otherwise the result would directly hold thanks to `tr′`.
- In the solving procedure, when building the derivations of `σF`, if we can detect that another instance of `F`, say `σ′F`, in the derivation necessarily occurred strictly before `σF`, then we know by the induction hypothesis `P(n)` that `σ′F′` has been executed before `σ′F` and so before `σF`.

These two properties are the building blocks of the inductive verification of queries in ProVerif: When generating reachable goals, ProVerif builds Horn clauses with instances of `F` as a conclusion. Upon generating a clause of the form `H ∧ σ′F -> σF`, ProVerif already knows that this clause represents an execution of `σ′F` before an execution of `σF`. ProVerif uses order constraints to infer that `σ′F` was executed strictly before `σF`. In this case, the verification procedure will add `σ′F′` to the hypotheses of the clause, i.e., it replaces the clause `H ∧ σ′F -> σF` with the clause `H ∧ σ′F′ ∧ σ′F -> σF`.

Let us illustrate this concept on the small example, available in `docs/ex_induction.pv`, that is a simplified version of the Yubikey protocol [Yub10].

```proverif
 1  free c:channel.
 2  free k: bitstring [private ].
 3  free d_P:channel [private].
 4  free d_Q:channel [private].
 5
 6  fun senc(nat , bitstring ): bitstring .
 7  reduc forall K: bitstring ,M:nat; sdec(senc(M,K),K) = M.
 8
 9  event CheckNat(nat).
10
11  query i :nat; event(CheckNat(i )) ==> is nat(i ).
12
13  let P =
14      in(c,x: bitstring );
15      in(d_P,( i :nat , j : nat ));
16      let j ': nat = sdec(x,k) in
17      event CheckNat(i );
18      event CheckNat(j );
19      if   j '   > j
20      then out(d_P,( i+1,j '))
21      else out(d_P,(i , j )).
22
23  let Q =
24      in(d_Q, i : nat );
25      out(c,senc(i ,k));
26      out(d_Q, i+1).
27
28  process
29      out(d_P,(0 ,0)) | out(d_Q,0) | ! P | ! Q
```

In this protocol, the processes `P` and `Q` share a private key `k` and they both have a memory cell respectively represented by the private channels `d_P` and `d_Q`. Every time the process `Q` increments the value stored in its memory cell, it also outputs the previous value encrypted with the shared key `k`, i.e. `out(c,senc(i,k))`. On the other hand, the process `P` stores in its memory cell two values: the number of time it received a fresh encryption from `Q`, represented by `i:nat` in `in(d_P,(i:nat, j:nat))` and the last value it received from `Q`, represented by `j:nat`.

We aim to prove that the values of the memory cell of `P` are always natural numbers, which is represented by the query:

```proverif
query i :nat; event(CheckNat(i )) ==> is nat(i ).
```

However, verifying this protocol with `./proverif docs/ex_induction.pv | grep "RES"` produces the following output:

```
RESULT event(CheckNat(i_2 )) ==> is nat(i_2) cannot be proved.
```

If we look more closely at the output, we can observe that ProVerif considers the following reachable goal

```
is not nat(i_2 + 1) && j_1 ≥ j_2 + 1 && mess(d_P[] ,( i_2 , j_2 )) &&
        mess(d_Q[] , j_1 ) && mess(d_Q[] , j'_1) -> end(CheckNat( i_2 + 1))
```

To ensure termination, ProVerif avoids resolving upon facts that would lead to trivial infinite loops. This is the case for the facts representing the memory cells, which are `mess(d_P[],(i_2,j_2))`, `mess(d_Q[],j_1)`, and `mess(d_Q[],j'_1)`, so resolution stops with the clause above. Since the clause contradicts the query, ProVerif concludes that it cannot prove the query.

By adding the option `induction` after the query as follows

```proverif
query i :nat; event(CheckNat(i )) ==> is nat(i) [induction].
```

ProVerif would initially generate the following reachable goal:

```
j_1 ≥ j_2 + 1 && begin(CheckNat(j_2)) && begin(CheckNat(i_2 )) &&
        mess(d_P[] ,( i_2 , j_2 )) && mess(d_Q[] , j_1 ) -> end(CheckNat( i_2 + 1))
```

Furthermore, ProVerif understands that the event `CheckNat(i_2)` occurs strictly before `CheckNat(i_2 + 1)`. By applying the induction hypothesis on `CheckNat(i_2)`, it adds `is nat(i_2)` in the hypotheses of the clause, yielding

```
is nat(i_2) && j_1 ≥ j_2 + 1 && begin(CheckNat(j_2)) && begin(CheckNat(i_2 )) &&
        mess(d_P[] ,( i_2 , j_2 )) && mess(d_Q[] , j_1 ) -> end(CheckNat( i_2 + 1))
```

Since this clause does not contradict the query, ProVerif is able to prove the query: Verifying this protocol with `./proverif docs/ex_induction_proof.pv | grep "RES"` produces the output

```
RESULT event(CheckNat(i_2 )) ==> is nat(i_2) is true.
```

**Remark.** When the setting `inductionQueries` is set to `true`, all queries are proved by induction. In such a case, one can use the option `[noInduction]` on one specific query to enforce that it is not proved by induction.

### 6.1.2 Group of queries

Queries may also be stated in the form:

```
query x₁ : t₁,...,xₘ : tₘ; q₁;...;qₙ.
```

where each `qᵢ` is a query as defined in Figure 4.3. Furthermore, it is also possible to prove a group of queries by induction. However the output of ProVerif differs from proving a single query by induction.

Coming back to our previous example, we would additionally prove that the values stored in the memory cell `Q` and the value of `j'` in `P` are also natural numbers. The input file `docs/ex_induction_group.pv` partially displayed here integrates such queries.

```proverif
 9  event CheckNat(nat).
10  event CheckNatQ(nat).
11
12  query i :nat;
13      event(CheckNat(i )) ==> is nat(i );
14      event(CheckNatQ(i )) ==> is nat(i );
15      mess(d_Q, i ) ==> is nat(i) [induction].
16
17  let P =
18      in(c,x: bitstring );
19      in(d_P,( i :nat , j : nat ));
20      let j ': nat = sdec(x,k) in
21      event CheckNat(i );
22      event CheckNat(j );
23      event CheckNatQ(j ');
24      if   j '   > j
25      then out(d_P,( i+1,j '))
26      else out(d_P,(i , j )).
```

Verifying this protocol with `./proverif docs/ex_induction_group.pv | grep "RES"` produces the following output:

```
PARTIAL RESULT event(CheckNat(i_2 )) ==> is nat(i_2) is true if
     the inductive queries can be proved.
PARTIAL RESULT event(CheckNatQ(i_2 )) ==> is nat(i_2) is true if
     the inductive queries can be proved.
PARTIAL RESULT mess(d_Q[] , i_2) ==> is nat(i_2) cannot be proved if
     the inductive queries can be proved.
PARTIAL RESULT event(CheckNat(i_2 )) ==> is nat(i_2) is true if
     the inductive queries can be proved.
PARTIAL RESULT event(CheckNatQ(i_2 )) ==> is nat(i_2) cannot be proved if
     the inductive queries can be proved.
PARTIAL RESULT mess(d_Q[] , i_2) ==> is nat(i_2) cannot be proved if
     the inductive queries can be proved.
PARTIAL RESULT event(CheckNat(i_2 )) ==> is nat(i_2) is true if
     the inductive queries can be proved.
PARTIAL RESULT event(CheckNatQ(i_2 )) ==> is nat(i_2) cannot be proved if
     the inductive queries can be proved.
PARTIAL RESULT mess(d_Q[] , i_2) ==> is nat(i_2) cannot be proved if
     the inductive queries can be proved.
FINAL RESULT:
RESULT mess(d_Q[] , i_2) ==> is nat(i_2) cannot be proved.
RESULT event(CheckNatQ(i_2 )) ==> is nat(i_2) cannot be proved.
RESULT event(CheckNat(i_2 )) ==> is nat(i_2) is true.
```

The proof of a group of queries by induction is done in multiple steps. In the first step, ProVerif assumes that the inductive hypotheses of all individual queries hold and it tries to prove the group of queries under this assumption. If the verification succeeds, then ProVerif concludes that the group of queries is true. When however ProVerif cannot verify all the queries, it will refine the inductive hypotheses to consider. More specifically, it will try to prove the group of queries again, but only under the inductive hypotheses of the individual queries that it was previously able to prove. ProVerif repeats this refinement of inductive queries until it can prove all of them.

In our example, the first three partial results correspond to the first step where ProVerif assumed as inductive hypotheses the three queries. Under this assumption, it was only able to prove two of them, namely `event(CheckNat(i_2)) ==> is nat(i_2)` and `event(CheckNatQ(i_2)) ==> is nat(i_2)`. The next three partial results therefore correspond to the second step where ProVerif only assumes as inductive hypotheses the queries `event(CheckNat(i_2)) ==> is nat(i_2)` and `event(CheckNatQ(i_2)) ==> is nat(i_2)`. In this second step, the query `event(CheckNatQ(i_2)) ==> is nat(i_2)` cannot be proved anymore. Since ProVerif did not prove the two inductive queries, it refines again its inductive hypotheses by considering only `event(CheckNat(i_2)) ==> is nat(i_2)`. Since it is able to prove this query in the third step, ProVerif can conclude that it is true.

Note that the verification summary only displays the final results.

```
--------------------------------------------------------------
Verification summary:

Query event(CheckNat(i_2 )) ==> is nat(i_2) is true.

Query event(CheckNatQ(i_2 )) ==> is nat(i_2) cannot be proved.

Query mess(d_Q[] , i_2 ) ==> is nat(i_2) cannot be proved.
--------------------------------------------------------------
```

We explain in Section 6.7.2 why ProVerif is not able to prove the query `mess(d_Q[],i_2) ==> is nat(i_2)` and how one can help ProVerif to prove it.

**Remark.** By default, for a group of queries, ProVerif does not apply the induction hypothesis during saturation, since some of the queries may not be true. The user may add the option `proveAll` to the group:

```
query x₁ : t₁,...,xₘ : tₘ; q₁;...;qₙ  [ induction ,proveAll ].
```

in order to tell ProVerif that it should prove all queries; it can then use them as induction hypothesis during saturation. In case some of the queries cannot be proved, all queries of the group are considered as not proved since the proof was attempted with an induction hypothesis that does not hold.

## 6.2 Axioms, restrictions, and lemmas

ProVerif supports the declaration of lemmas in addition to standard queries with the following syntax:

```
lemma x₁ : t₁,...,xₙ : tₙ; cq₁;...;cqₙ.
axiom x₁ : t₁,...,xₙ : tₙ; cq₁;...;cqₙ.
restriction x₁ : t₁,...,xₙ : tₙ; cq₁;...;cqₙ.
```

where `cq₁,...,cqₙ` are reachability or correspondence queries as defined in Figure 4.3 with the following restrictions: If `cqᵢ` is the query `F₁ && ... && Fₘ ==> H` then

- `H` does not contain any nested correspondence;
- facts of `H` can only be non-injective events, equalities, inequalities, disequalities, attacker facts, message facts, or table facts;
- `F₁,...,Fₘ` can only be non-injective events, attacker facts, message facts, table facts, inequalities, disequalities, or `is nat`;
- facts with temporal variables `AF@t` are not allowed.

The semantics of lemmas, axioms, and restrictions is the same as the semantics of queries, except for lemmas, axioms, and restrictions that conclude attacker or table facts: For queries, we allow the attacker facts in the conclusion to be derived by computations from attacker knowledge collected before `F₁,...,Fₘ`, and the table facts to be derived by phase changes from table facts true before `F₁,...,Fₘ`. For lemmas, axioms, and restrictions, such additional computations and phase changes are forbidden and the attacker and table facts in the conclusion themselves must be true before `F₁,...,Fₘ`.

These lemmas, axioms, and restrictions will be used internally by ProVerif to remove, simplify, or instantiate clauses during the saturation procedure of the main query. Intuitively, a lemma `F₁ && ... && Fₘ ==> H` is applied on a clause `H′ -> C′` when there exists a substitution `σ` such that `Fᵢσ ⊆ H′` for all `i = 1...m`; and the resulting clause being `H′ && Hσ -> C′`.

For attacker, message, and table facts in `H`, a so-called "blocking" version of them is added to the clause instead of the fact itself: ProVerif does not perform resolution on blocking facts and keeps them, which enables the proof of such facts in queries. For example, writing the trivially true lemma

```proverif
lemma x₁ : t₁,...,xₙ : tₙ; attacker(M) ==> attacker(M ).
```

adds the blocking version of attacker facts instance of `attacker(M)` to clauses that contain such attacker facts in hypothesis. Then, the blocking facts are preserved in subsequent resolutions, enabling the proof of queries `... ==> attacker(M)`. Without this lemma, such queries could not be proved because `attacker(M)` is resolved upon, making the information that `attacker(M)` was true disappear.

When restrictions are declared, ProVerif will prove the main queries only on all traces (resp. bitraces) of the input process (resp. biprocess) that satisfy the restrictions.

To preserve soundness, ProVerif proves all the lemmas as if they were standard queries (still taking into account the different semantics mentioned above) before using them in the saturation procedure. ProVerif will produce an error if it is not able to prove one of the lemmas. Note that if restrictions are also declared, the lemmas are proved only on the traces satisfying the restrictions. However, ProVerif assumes that all axioms are true on the input process and does not attempt to prove them. When axioms are declared, it is important to note that a security proof holds assuming that the axioms also hold. Axioms are typically useful for hand-proved properties that cannot be proved with ProVerif.

Depending on the lemmas, restrictions, and axioms declared, precision and termination of ProVerif can be improved. ProVerif ignores the number of repetitions of actions due to the transformation of processes into Horn clauses. Hence, the following example yields a false attack:

```proverif
new k:key; out(c, senc(senc(s,k),k));
in(c, x: bitstring ); out(c, sdec(x,k))
```

where `c` is a public channel, `s` is a private free name which should be kept secret, and `senc` and `sdec` are symmetric encryption and decryption respectively. ProVerif thinks that one can decrypt `senc(senc(s,k),k)` by sending it to the input, so that the process replies with `senc(s,k)`, and then sending this message again to the input, so that the process replies with `s`. However, this is impossible in reality because the input can be executed only once.

However, a generic transformation on processes, presented in [CCT18], using events allows to partially take into account the number of repetitions of actions. Intuitively after each input, an event recording the input message is added.

```proverif
new st :stamp; new k:key; out(c, senc(senc(s ,k),k));
in(c, x: bitstring ); event UAction(st ,x); out(c, sdec(x,k))
```

It was shown in [CCT18] that adding such events preserves the security properties and, moreover, that the following query always holds:

```proverif
forall st :stamp, x: bitstring , y: bitstring ;
  event(UAction(st ,x)) && event(UAction(st ,y)) ==> x = y.
```

Intuitively, the input action `in(c, x:bitstring)` is executed at most once for each value of the stamp `st`. Hence, if the value of the stamp `st` is the same, then the value of the input message `x` must also be the same. Ideally, we would declare this property as a lemma, but ProVerif is unable to prove it. Hence, since that property was shown by hand in [CCT18], we can declare it as an axiom. In the following complete script, ProVerif is thus able to prove the secrecy of `s`.

```proverif
 1  free c:channel.
 2  free s: bitstring [private ].
 3
 4  type key.
 5  type stamp.
 6  fun senc(bitstring ,key): bitstring .
 7  reduc forall x: bitstring ,y:key; sdec(senc(x,y),y) = x.
 8
 9  event UAction(stamp, bitstring ).
10
11  axiom st:stamp, x: bitstring , y: bitstring ;
12      event(UAction(st ,x)) && event(UAction(st ,y)) ==> x = y.
13
14  query attacker(s).
15
16  process
17    new k:key; out(c, senc(senc(s,k),k));
18     in(c, x: bitstring );
19    new st: stamp;
20     event UAction(st ,x);
21    out(c, sdec(x,k))
```

In fact, this generic transformation has been natively added in ProVerif and can be activated by adding the option `[precise]` after the input. In our example, it would correspond to the following process.

```proverif
new k:key; out(c, senc(senc(s,k),k));
in(c, x: bitstring) [precise ]; out(c, sdec(x,k))
```

Similarly, the option `[precise]` can be added in the `get ... in P else Q` and `let ... suchthat` (see Section 6.3) constructs as follows.

```proverif
get d(T₁ ,...,Tₙ ) [ precise] in P else Q
get d(T₁ ,...,Tₙ ) suchthat M [precise] in P else Q
let x₁ : t₁ ,...,xₙ : tₙ  suchthat p(M₁ ,...,Mₖ ) [precise] in P else Q
```

Alternatively, one can use the setting `set preciseActions = true`, which means that all inputs, `get ... in P else Q`, and `let ... suchthat` constructs have the option `precise`. Hence ProVerif is able to prove the secrecy of `s` in the following script.

```proverif
1  free c:channel.
2  free s: bitstring [private ].
3
4  type key.
5  fun senc(bitstring ,key): bitstring .
6  reduc forall x: bitstring ,y:key; sdec(senc(x,y),y) = x.
7
8  set preciseActions = true.
9
10  query attacker(s).
11
12  process
13     new k:key; out(c, senc(senc(s,k),k));
14     in(c, x: bitstring );
15     out(c, sdec(x,k))
```

#### Subterm predicate

We allow in the premise of an axiom or a restriction a special predicate `subterm(M,N)`. This predicate holds when `M` is a subterm of `N` modulo the equational theory. For example, the following restriction

```proverif
restriction x: bitstring , y:nat; event(A(x)) && subterm(y,x) ==> y <> 0
```

restricts the verification of queries to traces such that if the event `A(M)` is emitted then `0` is not a subterm of `M`.

Note that the predicate `subterm` is not allowed in lemmas or queries.

#### Order of lemmas

As for queries, lemmas can be either grouped inside a single lemma declaration or they can be separately declared with multiple lemma declarations. While grouping the lemmas may improve the performance of ProVerif, declaring them separately may improve its completeness. Indeed, ProVerif proves the lemmas in the order they are declared in the input file. Moreover, it also uses proven lemmas to help proving new lemmas. For example, by declaring the following lemmas,

```proverif
lemma x¹₁ : t¹₁,...,x¹ₙ : t¹ₙ ; cq₁.
lemma x²₁ : t²₁,...,x²ₙ : t²ₙ ; cq₂.
lemma x³₁ : t³₁,...,x³ₙ : t³ₙ ; cq₃.
```

ProVerif first tries to prove `cq₁` alone then tries to prove `cq₂` by using `cq₁` in the saturation procedure and finally tries to prove `cq₃` by using `cq₁` and `cq₂` in the saturation procedure.

The order of axiom and restriction declarations does not matter as they are globally applied to all lemmas and queries.

#### Options

Adding lemmas in most cases improves the completeness of ProVerif. However, it is less clear how lemmas influence its termination as it heavily depends on the process and declared lemmas. Thus, lemmas can be declared with several options to parameterize how lemmas should be applied during the saturation procedure. The following exclusive options are available: `noneSat`, `discardSat`, `instantiateSat` (default), `fullSat`. The option `noneSat` indicates that the lemma should not be used in the saturation. The saturation behaves as if the lemma was declared as a query. The option `discardSat` enforces that a lemma should only be applied if its application on a Horn clause renders its hypotheses unsatisfiable. The option `instantiateSat` enforces that the lemma should instantiate at least one variable of the Horn clause or render the hypotheses of the clause unsatisfiable. Finally, with the option `fullSat`, the lemma is applied without restriction. These options can also be given for declared axioms.

When defining a lemma with the option `removeEvents`, ProVerif removes from clauses the events that correspond to the premise of this lemma and that do not seem useful anymore because the lemma has already been applied or it will never be applicable using this event. The latter is approximated hence may result in a loss of precision (ProVerif remains sound) but it also speeds up the resolution and may even allow it to terminate. The opposite option `keepEvents` ensures that ProVerif will never remove from clauses any event corresponding to the premise of this lemma. This is the default. The default can be changed using the global setting `removeEventsForLemma` (see Section 6.6.2), so that all lemmas without explicit option can be considered as being declared with the option `removeEvents`.

In the case of correspondence queries and once the saturation completes, ProVerif will also rely on lemmas, restrictions, and axioms when verifying queries. We therefore have similar options parameterizing how lemmas should be applied during the verification procedure: `noneVerif`, `discardVerif`, `instantiateVerif`, and `fullVerif` (default). Note that, in contrast to the default option for the saturation procedure, ProVerif applies lemmas and axioms without restriction by default during the verification procedure.

Finally, lemmas can be declared with the option `maxSubset`. By default, when ProVerif is unable to prove a lemma or a group of lemmas, it raises an error. With the option `maxSubset`, ProVerif aims to find the maximal subset of provable lemmas in a group and discards the remaining ones. Soundness is guaranteed by the fact that ProVerif only keeps the lemmas in the group that it is able to prove. Note that this option is not allowed for axioms. Moreover, this option is not exclusive with the options `noneSat`, `discardSat`, `instantiateSat`, and `fullSat`. For example, in the following script, ProVerif first tries to find the maximal subset `S` of lemmas `cq₁,...,cqₙ` that it can prove. Second, it will prove the query `attacker(s)` by only using the lemmas in `S` when they refute the hypotheses of Horn clauses during the saturation procedure for the query `attacker(s)`.

```proverif
lemma x₁ : t₁,...,xₙ : tₙ; cq₁;...;cqₙ  [ maxSubset,discardSat ].
query attacker(s).
```

As any query, a lemma can be proved by induction by adding the option `induction`. By default, since a lemma must be proved by ProVerif (otherwise an error is raised), the inductive hypothesis corresponding to the lemma is also applied during the saturation procedure, which may enforce its termination. (For groups of queries, this happens only with the option `proveAll`.) When a group of lemmas is declared with the option `maxSubset`, the inductive hypothesis is not applied during the saturation procedure and is only applied during the verification procedure (similarly to the default situation for queries). Note that the options `noneSat`, `noneVerif`, `discardSat`, ... can also modify how the inductive hypothesis is applied during the saturation and verification procedures.

**Remark 1.** When the setting `inductionLemmas` is set to `true`, all lemmas are proved by induction. In such a case, one can use the option `[noInduction]` on one specific lemma to enforce that it is not proved by induction. Moreover, the default applications of lemmas during the saturation and verification procedures can also be modified using global settings (see Section 6.6.2).

**Remark 2.** When ProVerif fails to prove an equivalence query (or a real or random query) on the initial process, ProVerif tries to generate simplified processes on which to prove the query. Though the simplification preserves equivalence properties, an axiom (resp. restriction) that holds on the initial process does not necessarily hold on the simplified process. Therefore by default, ProVerif does not consider the axioms (resp. restrictions) on these simplified processes. These axioms (resp. restrictions) can however still be considered on simplified processes by declaring the axiom (resp. restriction) with the option `keep`.

#### Lemmas for equivalence queries

ProVerif also supports the declaration of lemmas for equivalence queries by proving correspondence queries on biprocesses and more specifically on bitraces of biprocesses. Once proved, the lemmas are used during the saturation procedure for the equivalence query. Thus, lemmas can be used to help ProVerif prove a previously unproved equivalence but they can also be used to enforce termination. Intuitively, to prove a lemma on a biprocess, ProVerif generates the same set of Horn clauses as the ones generated for an equivalence proof but removes clauses with `bad` as conclusion. Indeed, these clauses are only useful to prove equivalence and can be soundly ignored when proving a correspondence query on a biprocess. Since ProVerif does not saturate the same set of Horn clauses, one may hope that ProVerif terminates for the proof of the lemma which would then be used to enforce termination for the equivalence proof. As an example, consider the simplified Yubikey protocol introduced in Section 6.1 modified as follows.

```proverif
1  free c:channel.
2  free k: bitstring [private ].
3  free d_P:channel [private].
4  free d_Q:channel [private].
5
6  fun senc(nat , bitstring ): bitstring .
7  reduc forall K: bitstring ,M:nat; sdec(senc(M,K),K) = M.
8
9  let P =
10     in(c,x: bitstring );
11     in(d_P,( i :nat , j : nat ));
12      let j ': nat = sdec(x,k) in
13      if j ' > j
14     then out(d_P,( i+1,choice[j ' ,j '+1]))
15      else out(d_P,(i , j )).
16
17  let Q =
18     in(d_Q, i : nat );
19     out(c,senc(i ,k));
20     out(d_Q, i+1).
21
22  process
23     out(d_P,(0 ,0)) | out(d_Q,0) | ! P | ! Q
```

In this protocol, we compare the case where the process `P` either records the value encrypted by `Q` or its value plus one. Executing ProVerif on `docs/ex_lemmas_equiv.pv` yields many termination warnings on increasingly large clauses (a good indicator of the non-termination of the saturation procedure). However, the clauses of almost all warnings contain the fact `mess2(d_Q[],j_1,d_Q[],j'_2)` suggesting that ProVerif is considering derivations where the value of the memory cell stored by `Q` differs on the two sides of the equivalence. One can use a lemma to show that these derivations cannot happen and so should be discarded.

The function `choice` can be used in a lemma to specify different terms on the two sides of the bitrace. In our example, the following lemma can be declared (see `docs/ex_lemmas_equiv_proof.pv`)

```proverif
lemma i :nat , i ': nat ; mess(d_Q,choice[ i , i ']) ==> i = i '.
```

Executing ProVerif on `docs/ex_lemmas_equiv_proof.pv`, one can see that the lemma is actually encoded as

```
mess2(d_Q[] , i_3 ,d_Q[] , i ') ==> i_3 = i '
```

and that ProVerif is able to prove the lemma and the equivalence.

**Remark 1.** In the example `docs/ex_lemmas_equiv_proof.pv`, ProVerif first proves the lemma in the biprocess given as input. However, ProVerif fails to prove the equivalence on this biprocess despite the lemma. Thus it simplifies the biprocess into a new one (named `biprocess 1`). Even though the lemma was proved on the input biprocess, it does not necessarily imply that the lemma holds on `biprocess 1`. It was only shown that simplification of biprocesses preserves observational equivalence. Therefore, ProVerif proves the lemma on `biprocess 1` again, and finally proves the desired equivalence. In this case, the verification summary just shows the results on the biprocess on which the equivalence was proved, as follows:

```
--------------------------------------------------------------
Verification summary:

Query(ies):
  - Observational equivalence is true.

Associated lemma(s):
  - Lemma mess(d_Q[],choice[i_3,i']) ==> i_3 = i' encoded as
    mess2(d_Q[],i_3,d_Q[],i') ==> i_3 = i' is true in biprocess 1.
--------------------------------------------------------------
```

**Remark 2.** Lemmas on biprocesses can also be proved by induction by adding the option `induction`.

**Remark 3.** In fact, to prove a lemma on a biprocess, ProVerif does not remove all clauses with `bad` as conclusion during the initial generation of Horn clauses. It preserves the clauses corresponding to the attacker power to distinguish messages but removes the ones that focus on the control flow of the biprocess. Keeping these clauses allows ProVerif to activate an optimization during the saturation procedure which improves termination. After completion of the saturation procedure, if `bad` is shown to be derivable, then ProVerif considers that it cannot prove the lemma. Leaving these clauses with `bad` as conclusion does not sacrifice soundness since the lemma is rejected when `bad` is derivable.

#### Public variables and secrecy

As shown in Section 4.3.1, the syntax of queries `q` is as follows:

```
cq public vars y₁,...,yₘ
secret x public vars y₁,...,yₘ  [ reachability ]
secret x public vars y₁,...,yₘ  [ real or random ]
```

where the indication `[ reachability ]` may be omitted or replaced with `[pv reachability]`, `[real or random]` may be replaced with `[pv real or random]`, and `public vars y1,...,ym` may be omitted. When present, `public vars y₁,...,yₘ` means that `y₁,...,yₘ` are public, that is, the adversary has read access to them. Queries with public variables are implemented by modifying the considered process to output the contents of these variables on a public channel. Similarly, queries `secret x public vars y₁,...,yₘ [real or random]` are implemented by modifying the process to express observational equivalence between the case in which the protocol outputs `x` and the case in which it outputs a fresh random value. (The modified process is then a biprocess.) Different lemmas or axioms may hold for different processes, so for different public variables and for real-or-random secrecy queries. Therefore, the user has to specify to which queries the lemmas and axioms apply. This is done as follows:

- Lemmas and axioms `cqᵢ` apply to queries without public variables and that are not real-or-random secrecy queries, that is, correspondence queries with public variables `cq`, strong secrecy queries, off-line guessing attacks queries and secrecy queries `secret x [reachability]`, as well as equivalence queries between two processes. Only in the last case, the lemmas or axioms may contain the function `choice` (but not necessarily).
- Lemmas and axioms `cqᵢ` for `{ public vars y₁,...,yₘ }` apply to queries with public variables `y₁,...,yₘ` and that are not real-or-random secrecy queries, that is, `cq public vars y₁,...,yₘ` and `secret x public vars y₁,...,yₘ [reachability]`. These lemmas and axioms must not contain the function `choice`.
- Lemmas and axioms `cqᵢ` for `{ secret x public vars y₁,...,yₘ [real or random] }` apply only to the query `secret x public vars y₁,...,yₘ [real or random]`, and similarly lemmas and axioms `cqᵢ` for `{ secret x [real or random] }` apply only to the query `secret x [real or random]`. These lemmas and axioms may contain the function `choice` (but not necessarily).

For example, in the following input file (partially displayed),

```proverif
1  axiom y: bitstring ,y': bitstring ;
2      event(A(choice[y,y'])) ==> y = y'
3      for { secret s public vars x [real or random] }.
4
5  lemma x: bitstring ;
6      event(B(x)) ==> x = a;
7      event(A(x)) ==> x = b.
8
9  lemma x: bitstring ; event(A(x)) ==> x = b for { public vars x }.
10
11 query x: bitstring ;
12     event(A(x)) ==> event(B(a)) public vars x;
13     attacker(x).
14
15 noninterf d.
16
17 query secret s public vars x [real or random ].
```

the axiom will only be used for the proof of `secret s public vars x [real or random]`; the first lemma will be used for the proofs of `attacker(x)` and `noninterf d`; the last lemma will be used for the proof of `event(A(x)) ==> event(B(a)) public vars x`.

## 6.3 Predicates

ProVerif supports predicates defined by Horn clauses as a means of performing complex tests or computations. Such predicates are convenient because they can easily be encoded into the internal representation of ProVerif which also uses clauses. Predicates are defined as follows:

```proverif
pred p(t₁,...,tₖ).
```

declares a predicate `p` of arity `k` that takes arguments of types `t₁,...,tₖ`. The predicates `attacker`, `mess`, `ev`, and `evinj` are reserved for internal use by ProVerif and cannot be declared by the user. The declaration

```proverif
clauses C₁;...;Cₙ.
```

declares the clauses `C₁,...,Cₙ` which define the meaning of predicates. Clauses are built from facts which can be `p(M₁,...,Mₖ)` for some predicate declared by `pred`, `M₁ = M₂`, or `M₁ <> M₂`. The clauses `Cᵢ` can take the following forms:

- `forall x₁ : t₁,...,xₙ : tₙ; F`
  which means that the fact `F` holds for all values of the variables `x₁,...,xₙ` of type `t₁,...,tₙ` respectively; `F` must be of the form `p(M₁,...,Mₖ)`.
- `forall x₁ :t₁,...,xₙ : tₙ; F₁ && ... && Fₘ -> F`
  which means that `F₁,...,` and `Fₘ` imply `F` for all values of the variables `x₁,...,xₙ` of type `t₁,...,tₙ` respectively; `F` must be of the form `p(M₁,...,Mₖ)`; `F₁,...,Fₘ` can be any fact.

In all clauses, the fact `F` is considered to hold only if its arguments do not fail and when the arguments of the facts in the hypothesis of the clause do not fail: for facts `p(M1,...,Mk)`, `M1,...,Mk` do not fail, for equalities `M₁ = M₂` and disequalities `M₁ <> M₂`, `M₁` and `M₂` do not fail.

Additionally, ProVerif allows the following equivalence declaration in place of a clause

```proverif
forall x₁ :t₁,...,xₙ : tₙ; F₁ && ... && Fₘ <-> F
```

which means that `F₁`, ..., and `Fₘ` hold if and only if `F` holds; `F₁,...,Fₘ,F` must be of the form `p(M₁,...,Mₖ)`. Moreover, `σFᵢ` must be of smaller size than `σF` for all substitutions `σ` and two facts `Fᵢ` of different equivalence declarations must not unify. (ProVerif will check these conditions.) This equivalence declaration can be considered as an abbreviation for the clauses

```proverif
forall x₁ :t₁,...,xₙ : tₙ; F₁ && ... && Fₘ -> F
forall x₁ :t₁,...,xₙ : tₙ; F -> Fᵢ (1≤i≤m)
```

but it further enables the replacement of `σF` with the equivalent facts `σF₁ && ... && σFₘ` in all clauses. This replacement may speed up the resolution process, and generalizes the replacement performed for data constructors.

(The declaration `forall x₁ : t₁,...,xₙ : tₙ; F₁ && ... && Fₘ <=> F` is equivalent to the previous one. It is kept only for backward compatibility.)

In all these clauses, all variables of `F₁,...,Fₘ,F` must be universally quantified by `forall x₁ : t₁, ..., xₙ : tₙ`. When `F₁,...,Fₘ,F` contain no variables, the part `forall x₁ : t₁,...,xₙ : tₙ;` can be omitted. In `forall x₁ : t₁, ..., xₙ : tₙ`, the types `t₁, ..., tₙ` can be either just a type identifier, or of the form `t or fail`, which means that the considered variable is allowed to take the special value `fail` in addition to the values of type `t`.

Finally, the declaration

```proverif
elimtrue x₁ :t₁,...,xₙ : tₙ; p(M₁,...,Mₖ).
```

means that for all values of the variables `x₁,...,xₙ`, the fact `p(M₁,...,Mₖ)` holds, like the declaration `clauses forall x₁ : t₁,...,xₙ : tₙ; p(M₁,...,Mₖ)`. However, it additionally enables an optimization: in a clause `R = F′ && H -> C`, if `F′` unifies with `F` with most general unifier `σᵤ` and all variables of `F′` modified by `σᵤ` do not occur in the rest of `R` then the hypothesis `F′` can be removed: `R` is transformed into `H -> C`, by resolving with `F`. As above, the types `t₁, ..., tₙ` can be either just a type identifier, or of the form `t or fail`.

#### Predicate evaluation

Predicates can be used in `if` tests. As a trivial example, consider the script:

```proverif
pred p(bitstring , bitstring ).
elimtrue x: bitstring , y: bitstring ; p(x,y).
event e.
query event(e).
process new m: bitstring ; new n: bitstring ; if p(m,n) then event e
```

in which ProVerif demonstrates the reachability of event `e`.

Predicates can also be evaluated using the `let ... suchthat` construct:

```proverif
let x₁ : t₁,...,xₙ : tₙ  suchthat p(M₁,...,Mₖ) in P else Q
```

where `M₁,...,Mₖ` are terms built over variables `x₁,...,xₙ` of type `t₁,...,tₙ` and other terms. If there exists a binding of `x₁,...,xₙ` such that the fact `p(M₁,...,Mₖ)` holds, then `P` is executed (with the variables `x₁,...,xₙ` bound inside `P`); if no such binding can be achieved, then `Q` is executed. As usual, `Q` may be omitted when it is the null process. When there are several suitable bindings, one possibility is chosen (but ProVerif considers all possibilities when reasoning). Note that the `let ... suchthat` construct does not allow an empty set of variables `x₁,...,xₙ`; in this case, the construct `if p(M₁,...,Mₖ) then P else Q` should be used instead.

The `let ... suchthat` construct is allowed in enriched terms (see Section 4.1.4) as well as in processes.

Note that there is an implementability condition on predicates, to make sure that the values of `x₁,...,xₙ` in `let x₁ : t₁,...,xₙ : tₙ suchthat` constructs can be efficiently computed. Essentially, for each predicate invocation, we bind variables in the conclusion of the clauses that define this predicate and whose position corresponds to bound arguments of the predicate invocation. Then, when evaluating hypotheses of clauses from left to right, all variables of predicates must get bound by the corresponding predicate call. The verification of the implementability condition can be disabled by

```proverif
set predicatesImplementable = nocheck.
```

Recursive definitions of predicates are allowed.

Predicates and the `let ... suchthat` construct are incompatible with strong secrecy (modeled by `noninterf`) and with `choice`.

#### Example: Modeling sets with predicates

As an example, we will demonstrate how to model sets with predicates (see file `docs/ex_predicates.pv`).

```proverif
type bset.
fun consset(bitstring , bset ): bset [data].
const emptyset: bset [data].
```

Sets are represented by lists: `emptyset` is the empty list and `consset(M,N)` concatenates `M` at the head of the list `N`.

```proverif
pred mem(bitstring , bset ).
clauses
     forall x: bitstring , y: bset ; mem(x, consset(x,y));
     forall x: bitstring , y:bset , z: bitstring ; mem(x,y) -> mem(x, consset(z,y)).
```

The predicate `mem` represents set membership. The first clause states that `mem(M,N)` holds for some terms `M`, `N` if `N` is of the form `consset(M,N′)`, that is, `M` is at the head of `N`. The second clause states that `mem(M,N)` holds if `N = consset(M′,N′)` and `mem(M,N′)` holds, that is, if `M` is in the tail of `N`.

We conclude our example with a look at the following ProVerif script:

```proverif
 1   event e.
 2   event e '.
 3   query event(e).
 4   query event(e ').
 5
 6   type bset.
 7   fun consset(bitstring , bset ): bset [data].
 8   const emptyset: bset [data].
 9   pred mem(bitstring , bset ).
10   clauses
11        forall x: bitstring , y: bset ; mem(x, consset(x,y));
12        forall x: bitstring , y:bset , z: bitstring ; mem(x,y) -> mem(x, consset(z,y)).
13
14   process
15         new a: bitstring ;new b: bitstring ; new c: bitstring ;
16         let x = consset(a,emptyset) in
17         let y = consset(b,x) in
18         let z = consset(c,y) in (
19                if  mem(a,z) then
20                if  mem(b,z) then
21                if  mem(c,z) then
22               event e
23         )|(
24               let w: bitstring suchthat mem(w,x) in event e'
25         )
```

As expected, ProVerif demonstrates reachability of both `e` and `e′`. Observe that `e′` is reachable by binding the name `a` to the variable `w`.

#### Using predicates in queries

User-defined predicates can also be used in queries, so that the grammar of facts `F` in Figure 4.3 is extended with user-defined facts `p(M₁,...,Mₙ)`. As an example, the query

```proverif
query x: bitstring ; event(e(x)) ==> p(x)
```

holds when, if the event `e(x)` has been executed, then `p(x)` holds. (If this property depends on the code of the protocol but not on the definition of `p`, for instance because the event `e(x)` can be executed only after a successful test `if p(x) then`, a good way to prove this query is to declare the predicate `p` with option `block` and to omit the clauses that define `p`, so that ProVerif does not use the definition of `p`. See below for additional information on the predicate option `block`.)

#### Predicate options

Predicate declarations may also mention options:

```proverif
pred p(t₁,...,tₖ) [o₁,...,oₙ].
```

The allowed options `o₁,...,oₙ` are:

- **`block`:** Declares the predicate `p` as a blocking predicate. Blocking predicates must appear only in hypotheses of clauses. This situation typically happens when the predicate is defined by no clause declaration, but is used in tests or `let ... suchthat` constructs in the process (which leads to generating clauses that contain the predicate in hypothesis). Instead of trying to prove facts containing these predicates (which is impossible since no clause implies such facts), ProVerif collects hypotheses containing the blocking predicates necessary to prove the queries. In other words, ProVerif proves properties that hold for any definition of the considered blocking predicate.
- **`memberOptim`:** This must be used only when `p` is defined by

  ```proverif
  p(x,f(x,y))
  p(x,y) -> p(x,f(x′,y))
  ```

  where `f` is a data constructor. (Note that it corresponds to the case in which `p` is the membership predicate and `f(x,y)` represents the union of element `x` and set `y`.) `memberOptim` enables the following optimization: `attacker(x) && p(M₁,x) && ... && p(Mₙ,x)` where `p` is declared `memberOptim` is replaced with `attacker(x) && attacker(M₁) && ... && attacker(Mₙ)` when `x` does not occur elsewhere (just take `x = f(M₁,...f(Mₙ,x′))` and notice that `attacker(x)` if and only if `attacker(M₁)`, ..., `attacker(Mₙ)`, and `attacker(x′))`.

User-defined predicates are allowed after `==>` in lemmas and axioms. When these predicates are not blocking, applying the lemma adds a blocking version of the predicate to the hypothesis of the clause, not the predicate itself.

## 6.4 Referring to bound names in queries

Until now, we have considered queries that refer only to free names of the process (declared by `free`), for instance `query attacker(s)` when `s` is declared by `free s:t [private]`. It is in fact also possible to refer to bound names (declared by `new n:t` in the process) in queries. To distinguish them from free names, they are denoted by `new n` in the query. As an example, consider the following input file:

```proverif
1  free c:channel.
2  fun h(bitstring ): bitstring .
3
4  free n: bitstring .
5  query attacker(h((n,new n))).
6
7  process new n: bitstring ; out(c,n)
```

in which the process constructs and outputs a fresh name. Observe that the free name `n` is distinct from the bound name `n` and the query evaluates whether the attacker can construct a hash of the free name paired with the bound name. When an identifier is defined as a free name and the same identifier is used to define a bound name, ProVerif produces a warning. Similarly, a warning is also produced if the same identifier is used by two names or variables within the same scope. For clarity, we strongly discourage this practice and promote the use of distinct identifiers.

The term `new n` in a query designates any name created at the restriction `new n:t` in the process. It is also possible to make it more precise which bound names we want to designate: if the restriction `new n:t` is in the scope of a variable `x`, we can write `new n[x = M]` to designate any name created by the restriction `new n:t` when the value of `x` is `M`. This can be extended to several variables: `new n[x₁ = M₁, ..., xₙ = Mₙ]`. (This is related to the internal representation of bound names in ProVerif. Essentially, names are represented as functions of the variables which they are in the scope of. For example, the name `a` in the process `new a:nonce` is not in the scope of any variables and hence the name is modeled without arguments as `a[ ]`; whereas the name `b` in the process `in(c,(x:bitstring ,y:bitstring ));new b:nonce` is in the scope of variables `x`, `y` and hence will be represented by `b[x=M,y=N]` where the terms `M`, `N` are the values of `x` and `y` at run time, respectively.) Consider, for example, the process:

```proverif
1  free c:channel.
2  free A: bitstring .
3  event e(bitstring ).
4  query event(e(new a[x=A;y=new B])).
5
6  process
7      (in(c ,(y: bitstring ,x: bitstring ));new a: bitstring ; event e(a))
8      |  (new B: bitstring ;out(c,B))
```

The query `query event(e(new a[x=A;y=new B]))` tests whether event `e` can be executed with argument a name created by the restriction `new a:bitstring` when `x` is `A` and `y` is a name created by the restriction `new B:bitstring`. In the example process, such an event can be executed.

Furthermore, in addition to the value of the variables defined above the considered restriction `new`, one can also specify the value of `!i`, which represents the session identifier associated with the `i`-th replication above the considered `new`, where `i` is a positive integer. (Replications are numbered from the top of the process: `!1` corresponds to the first replication at the top of the syntax tree.) These session identifiers take a different value in each copy of the process created by the replication. It does not make much sense to give a non-variable value to these session identifiers, but they can be useful to designate names created in the same copy or in different copies of the process. Consider the following example:

```proverif
1  free c:channel.
2  event e(bitstring , bitstring ).
3  query i : sid ; event(e(new A[!1 = i ] , new B[!1 = i ])).
4
5  process
6      (in(c ,(y: bitstring ,x: bitstring ));event e(x,y))
7      |  !  (new A: bitstring ; new B: bitstring ;out(c ,(A,B)))
```

The query `event(e(new A[!1 = i], new B[!1 = i]))` tests if one can execute events `e(x,y)` where `x` is a name created at the restriction `new A: bitstring` and `y` is a name created at `new B: bitstring` in the same copy as `x` (of session identifier `i`).

It is also possible to use `let` bindings in queries: `let x = M in` binds the term `M` to `x` inside a query. Such bindings can be used anywhere in a query: they are added to reachability or correspondence queries, hypotheses, and facts in the grammar of correspondence assertions given in Figure 4.3. In such bindings, the term `M` must be a term without destructor. These bindings are specially useful in the presence of references to bound names. For instance, in the query `query attacker(h((new n,new n)))`, the two occurrences of `new n` may represent different names created at the same restriction `new n:t` in the process. In contrast, in the query `query let x = new n in attacker(h((x,x)))`, `x` represents any name created at the restriction `new n:t` and `(x,x)` is a pair containing twice the same name. Let bindings `let x = M in` therefore allow us to designate several times exactly the same value, even if the term `M` may designate several possible values due to the use of the `new n` construct.

References to bound names in queries were used, for instance, in [BC08].

## 6.5 Exploring correspondence assertions

ProVerif allows the user to examine which events must be executed before reaching a state that falsifies the current query. The syntax `putbegin event:e` instructs ProVerif to test which events `e(...)` are needed in order to falsify the current query. This means that when an event `e` needs to be executed to trigger another action, a `begin` fact `begin(e(...))` is going to appear in the hypothesis of the corresponding clause. This is useful when the exact events that should appear in a query are unknown. For instance, with the query

```proverif
query x: bitstring ; putbegin event:e; event(e′(x)).
```

ProVerif generates clauses that conclude `end(e′(M))` (meaning that the event `e′` has been executed), and by manual inspection of the facts `begin(e(M′))` that occur in their hypothesis, one can infer the full query:

```proverif
query x₁ : t₁,...,xₙ : tₙ; event(e ′(...)) ==> event(e(...)).
```

As an example, let us consider the process:

```proverif
1  free c:channel.
2  fun h(bitstring ): bitstring .
3
4  event e(bitstring ).
5  event e'( bitstring ).
6
7  query x: bitstring ; putbegin event:e; event (e'(x)).
8
9  process
10    new s: bitstring ;
11     (
12       event e(s);
13       out(c,h(s))
14     ) | (
15       in(c,=h(s));
16       event e'(h(s))
17     )
```

ProVerif produces the output:

```
. . .
-- Query putbegin event:e; not event(e'(x_5))
Completing ...
 Starting query not event(e'(x_5))
 goal reachable: begin(e(s_4 [])) -> end(e'(h(s_4 [])))
. . .
```

We can infer that the following correspondence assertion is satisfied by the process:

```proverif
query x: bitstring ; event (e '(h(x))) ==> event(e(x)).
```

This technique has been used in the verification of a certified email protocol, which can be found in subdirectory `examples/pitype/certified-mail-AbadiGlewHornePinkas/` (if you installed by OPAM in the switch ⟨switch⟩, the directory `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/certified-mail-AbadiGlewHornePinkas/`).

## 6.6 ProVerif options

In this section, we discuss the command-line arguments and settings of ProVerif. The default behavior of ProVerif has been optimized for standard use, so these settings are not necessary for basic examples.

### 6.6.1 Command-line arguments

The syntax for the command-line is

```
proverif [⟨options⟩] ⟨filename⟩
```

where `proverif` is ProVerif's binary, ⟨filename⟩ is the input file, and the command-line parameters `[⟨options⟩]` are of the following form:

- **`-in ⟨format⟩`** — Choose the input format (`horn`, `horntype`, `pi`, or `pitype`). When the `-in` option is absent, the input format is chosen according to the file extension, as detailed below. The input format described in this manual is the typed pi calculus, which corresponds to the option `-in pitype`, and is the default when the file extension is `.pv`. We recommend using this format. The other formats are no longer actively developed. Input may also be provided using the untyped pi calculus (option `-in pi`, the default when the file extension is `.pi`), typed Horn clauses (option `-in horntype`, the default when the file extension is `.horntype`), and untyped Horn clauses (option `-in horn`, the default for all other file extensions). The untyped Horn clauses and the untyped pi calculus input formats are documented in the file `docs/manual-untyped.pdf`.
- **`-out ⟨format⟩`** — Choose the output format, either `solve` (analyze the protocol) or `spass` (stop the analysis before resolution, and output the clauses in the format required for use in the Spass first-order theorem prover, see http://www.spass-prover.org/). The default is `solve`. When you select `-out spass`, you must add the option `-o ⟨filename⟩` to specify the file in which the clauses will be output.
- **`-TulaFale ⟨version⟩`** — For compatibility with the web service analysis tool TulaFale (see the tool download at http://research.microsoft.com/projects/samoa/). The version number is the version of TulaFale with which you would like compatibility. Currently, only version 1 is supported.
- **`-lib ⟨filename⟩`** — Specify a particular library file. Library files may contain declarations (including process macros). They are therefore useful for code reuse. Library files must be given the file extension `.pvl`, and this extension can be omitted from ⟨filename⟩. For example, the library file `crypto.pvl` can be specified as `-lib crypto`. Multiple libraries can be specified by using `-lib` for each library. The libraries are loaded in the same order as they appear on the command line. When no library is mentioned, ProVerif looks for a library named `default.pvl`, in the current directory and in the directory that contains the executable of ProVerif, and loads it if it is found. You can use this library for instance to give default settings.
- **`-graph ⟨directory⟩`** — This option is available only when the command-line option `-html ⟨directory⟩` is not set. It generates PDF files containing graphs representing traces of attacks that ProVerif had found. These PDF files are stored in the specified directory. That directory must already exist. By default, graphviz is used to create these graphs from the dot files generated by ProVerif. However, the user may specify a command of his own choice to generate graphs with the command line argument `-commandLineGraph`. Two versions of the graphs are available: a standard and a detailed version. The detailed version is built when `set traceDisplay = long.` has been added to the input file.
- **`-html ⟨directory⟩`** — This option is available only when the command-line option `-graph ⟨directory⟩` is not set. It generates HTML output in the specified directory. That directory must already exist. ProVerif may overwrite files in that directory, so you should create a fresh directory the first time you use this option. You may reuse the same directory for several runs of ProVerif if you do not want to keep the output of previous runs. ProVerif includes a CSS file `cssproverif.css` in the main directory of the distribution. You should copy that file to ⟨directory⟩. You may edit it to suit your preferences if you wish. After running ProVerif, you should open the file `⟨directory⟩/index.html` with your favorite web browser to display the results. If graphviz is installed and you did not specify a command line with the option `-commandLineGraph`, then drawings of the traces are available by clicking on `graph trace`. Two versions of the drawings are available: a standard and a detailed version. The detailed version is built when `set traceDisplay = long.` has been added to the input file.
- **`-commandLineGraph ⟨command line⟩`** — The option `-graph ⟨directory⟩` or the option `-html ⟨directory⟩` must be set. The specified command line is called for each attack trace found by ProVerif. It should contain the string `"%1"` which will be replaced by the name of the file in which ProVerif stores the graphical representation of the attack, without its `.dot` extension. For example, if you give the command line option `-commandLineGraph "dot -Tsvg %1.dot -o %1.svg"`, graphviz will generate a SVG file (instead of a PDF file) for each attack found by ProVerif.
- **`-set ⟨param⟩ ⟨value⟩`** — This option is equivalent to adding the instruction `set ⟨param⟩ = ⟨value⟩.` at the beginning of the input file. (See Section 6.6.2 for the list of allowed parameters and values.)
- **`-parse-only`** — This option stops ProVerif after parsing the input file. It just reports errors in the input file if any. It is useful when calling ProVerif from some IDE in order to report errors.
- **`-help` or `--help`** — Display a short summary of command-line options.

### 6.6.2 Settings

The manner in which ProVerif performs analysis can be modified by the use of parameters defined in the form `set ⟨param⟩ = ⟨value⟩`. The parameters below are supported, where the default value is the first mentioned. ProVerif also accepts `no` instead of `false` and `yes` instead of `true`.

#### Attacker configuration settings

- **`set ignoreTypes = true.`** (or `set ignoreTypes = all.`) / **`set ignoreTypes = false.`** (or `set ignoreTypes = none.` or `set ignoreTypes = attacker.` for backward compatibility)

  Indicates how ProVerif behaves with respect to types. By default (`set ignoreTypes = true.`), ProVerif ignores types; that is, the semantics of processes ignores types: the attacker may build and send ill-typed terms and the processes do not check types. This setting allows ProVerif to detect type flaw attacks. With the setting (`set ignoreTypes = false.`), the protocol respects the type system. In practice, protocols can be implemented to conform to this setting by making sure that the type converter functions and the tuples are correctly implemented: the result of a type converter function must be different from its argument, different from values of the same type obtained without applying the type converter function, and must identify which type converter function was applied, and this information must be checked upon pattern-matching; a tuple must contain the type of its arguments together with their value, and this type information must also be checked upon pattern-matching. Provided there is a single type converter function from one type to another, this can be implemented by adding a tag that represents the type to each term, and checking in processes that the tags are correct. The attacker may change the tag in clear terms (but not under an encryption or a signature, for instance). However, that does not allow it to bypass the type system. (Processes will never inspect inside values whose content does not match the tag.)

  Note that static typing is always enforced; that is, user-defined input files must always be well-typed and ProVerif will report any type errors.

  When types are ignored (`set ignoreTypes = true.`), functions marked `typeConverter` are removed when generating Horn clauses, so that you get exactly the same clauses as if the `typeConverter` function was absent. (In other words, such functions are the identity when types are ignored.)

  When types are taken into account, the state space is smaller, so the verification is faster, but on the other hand fewer attacks are found. Some examples do not terminate with `set ignoreTypes = true`, but terminate with `set ignoreTypes = false`.

- **`set attacker = active.`** / **`set attacker = passive.`**

  Indicates whether the attacker is active or passive. An active attacker can read messages, compute, and send messages. A passive attacker can read messages and compute but not send messages.

- **`set keyCompromise = none.`** / **`set keyCompromise = approx.`** / **`set keyCompromise = strict.`**

  By default (`set keyCompromise = none.`), it is assumed that session keys and more generally the session secrets are not a priori compromised. (The session secrets are all the names bound under a replication.) Otherwise, it is assumed that the session secrets of some sessions are compromised, that is, known by the attacker. Then ProVerif determines whether the secrets of other sessions can be obtained by the attacker. In this case, the names that occur in queries always refer to names of non-compromised sessions (the attacker has all names of compromised sessions), and the events that occur before an arrow `==>` in a query are executed only in non-compromised sessions. With `set keyCompromise = approx.`, the compromised sessions are considered as executing possibly in parallel with non-compromised ones. With `set keyCompromise = strict.`, the compromised sessions are finished before the non-compromised ones begin. The chances of finding an attack are greater with `set keyCompromise = approx.`. (It may be a false attack due to the approximations made in the verifier.) Key compromise is incompatible with attack reconstruction; moreover, phases and synchronizations cannot be used with the key compromise parameter enabled, because key compromise introduces a two-phase process. Combining the settings `keyCompromise = approx` and `preciseActions = trueWithoutArgsInNames` yields poor precision because `keyCompromise = approx` uses arguments of names to determine which names should be compromised and `preciseActions = trueWithoutArgsInNames` removes most arguments of names. Rather than using this setting, we recommend encoding the desired key compromise directly in the process that models the protocol, by outputting the compromised secrets on a public channel.

- **`set privateCommOnPublicTerms = true.`** / **`set privateCommOnPublicTerms = false.`**

  By default (`set privateCommOnPublicTerms = true.`), ProVerif follows the applied pi calculus semantics, which allows both private communications and communications through the adversary on public channels. With the setting `set privateCommOnPublicTerms = false`, ProVerif considers that all communications on terms initially public always go through the adversary, so private communications are forbidden on such channels. This setting sometimes yields a faster analysis, when the queries aim to prove `attacker(M)` or the lemmas or axioms use `attacker(M)` as assumption.

#### Simplification of processes

- **`set simplifyProcess = true.`** / **`set simplifyProcess = false.`** / **`set simplifyProcess = interactive.`**

  This setting is useful for proofs of observational equivalences with `choice`. With the setting `set simplifyProcess = true`, in case ProVerif fails to prove the desired equivalence, it tries to simplify the given biprocess and to prove the desired property on the simplified process, which increases its chances of success. With the setting `set simplifyProcess = false`, ProVerif does not compute the simplified biprocesses. With the setting `set simplifyProcess = interactive`, an interactive menu appears when ProVerif fails to prove the equivalence on the input biprocess. This menu allows one to either view the different simplified biprocesses or to select one of the simplified biprocesses for ProVerif to prove the equivalence.

- **`set rejectChoiceTrueFalse = true.`** / **`set rejectChoiceTrueFalse = false.`**

  With the setting `set rejectChoiceTrueFalse = true`, ProVerif does not try to prove observational equivalence for simplified processes that still contain tests `if choice[true,false ] then`, because the observational equivalence proof has little chance of succeeding in this case. With the setting `set rejectChoiceTrueFalse = false`, ProVerif still tries to observational equivalence for simplified processes that contain tests `if choice[true,false ] then`.

- **`set rejectNoSimplif = true.`** / **`set rejectNoSimplif = false.`**

  With the setting `set rejectNoSimplif = true`, ProVerif does not try to prove observational equivalence for simplified processes, when simplification has not managed to merge at least two branches of a test or to decompose a `let f (...) = f (...) in`. With the setting `set rejectNoSimplif = false`, ProVerif still tries to observational equivalence for these processes.

#### Verification of predicate definitions

- **`set predicatesImplementable = check.`** / **`set predicatesImplementable = nocheck.`**

  Sets whether ProVerif should check that predicate calls are implementable. See Section 6.3 for more details on this check. It is advised to leave the check turned on, as it is by default. Otherwise, the semantics of the processes may not be well-defined.

#### Patterns with diff or choice

- **`set allowDiffPatterns = false.`** / **`set allowDiffPatterns = true.`**

  The setting `allowDiffPatterns = true` enables an extension of ProVerif that allows `diff` or `choice` inside patterns, so that one can write for instance

  ```proverif
  in(c, diff [x:T ,y:T ]); ...
  in(c, diff [x,y]:T ); ...
  let diff [x,y] = M in ...
  ```

  or equivalent processes with `choice` instead of `diff`. With this extension, the obtained biprocess no longer comes from two independent processes. Indeed, this extension allows extracting each component of a received biterm, and mixing these components together, for instance using the first component in the second biprocess or comparing the first and the second components. This extension is mainly useful for generating possibly infinite families of static equivalences: the biprocess outputs the pairs of messages that should be indistinguishable. An example of application is the verification of frame opacity [HBD19, BDM20]. This extension is disabled by default.

#### Induction and lemma settings (see Sections 6.1 and 6.2)

- **`set inductionQueries = false.`** / **`set inductionQueries = true.`**

  When `true`, ProVerif proves all the queries by induction.

- **`set inductionLemmas = false.`** / **`set inductionLemmas = true.`**

  When `true`, ProVerif proves all the lemmas by induction.

- **`set saturationApplication = instantiate.`** / **`set saturationApplication = full.`** / **`set saturationApplication = none.`** / **`set saturationApplication = discard.`**

  By default (`set saturationApplication = instantiate.`), lemmas, axioms, and inductive hypotheses are only applied in the saturation procedure when they instantiate at least one variable. With `saturationApplication = none`, they are never applied during the saturation procedure. With `saturationApplication = discard`, they are only applied when they imply that the hypotheses of the clause are not satisfiable (hence discarding the clause). Finally, with `saturationApplication = full`, they are always applied.

- **`set verificationApplication = full.`** / **`set verificationApplication = none.`** / **`set verificationApplication = discard.`** / **`set verificationApplication = instantiate.`**

  By default (`set verificationApplication = full.`), lemmas, axioms, and inductive hypotheses are always applied during the verification procedure. The different options have the same meaning as the ones for the setting `saturationApplication` but applied to the verification procedure.

#### Precision, performance, and termination settings

The performance settings may result in more or fewer false attacks, but they never sacrifice soundness. It follows that when ProVerif says that a property is satisfied, then the model really does guarantee that property, regardless of how ProVerif has been configured using the settings presented here.

- **`set preciseActions = false.`** / **`set preciseActions = true.`** / **`set preciseActions = trueWithoutArgsInNames.`**

  When `true`, ProVerif increases the precision of the solving procedure by ensuring that it only considers derivations where an input of the process has been uniquely instantiated for each execution of the considered input. Similarly for `let ... suchthat` constructs and `get ... in` constructs. See Section 6.2 for more details. This setting increases precision possibly at the cost of performance and termination. When `trueWithoutArgsInNames`, in addition to the changes above, the fresh names created by `new` have as default arguments only session identifiers. This is usually sufficient thanks to the additional precision brought by `preciseActions`. (See the setting `movenew` below for an explanation of these arguments.)

- **`set movenew = false.`** / **`set movenew = true.`**

  Sets whether ProVerif should try to move restrictions under inputs, to have a more precise analysis (`set movenew = true.`), or leave them where the user has put them (`set movenew = false.`). Internally, ProVerif represents fresh names by functions of the variables bound above the `new`. Adjusting these arguments allows one to change the precision of the analysis: the more arguments are included, the more precise the analysis is, but also the more costly in general. The setting (`set movenew = true.`) yields the most precise analysis. You can fine-tune the precision of the analysis by keeping the default setting and moving `new`s manually in the input process.

- **`set movelet = true.`** / **`set movelet = false.`**

  When `movelet = true`, ProVerif moves `let`s downwards in the process as much as possible. By computing variables as late as possible, that can reduce the case distinctions that are made in the generation of clauses on some parts of the process, and thus generate fewer clauses and speed up resolution. When `movelet = false`, this transformation is not performed.

- **`set maxDepth = none.`** / **`set maxDepth = n.`**

  Do not limit the depth of terms (`none`) or limit the depth of terms to `n`, where `n` is an integer. A negative value means no limit. When the depth is limited to `n`, all terms of depth greater than `n` are replaced with new variables. (Note that this makes clauses more general.) Limiting the depth can be used to enforce termination of the solving process, at the cost of precision. This setting is not recommended: it often causes too much imprecision. Using `nounif` (see Section 6.7.2) is delicate but may be more successful in practice.

- **`set maxHyp = none.`** / **`set maxHyp = n.`**

  Do not limit the number of hypotheses of clauses (`none`) or limit it to `n`, where `n` is an integer. A negative value means no limit. When the number of hypotheses is limited to `n`, arbitrary hypotheses are removed from clauses, so that only `n` hypotheses remain. Limiting the number of hypotheses can be used to enforce termination of the solving process at the cost of precision (although in general limiting the depth by the above declaration is enough to obtain termination). This setting is not recommended.

- **`set selFun = TermMaxsize.`** / **`set selFun = Term.`** / **`set selFun = NounifsetMaxsize.`** / **`set selFun = Nounifset.`**

  Chooses the selection function that governs the resolution process. All selection functions favor unifying on facts indicated by a (positive) `select` declaration and avoid unifying on facts indicated by a (positive) `noselect` or `nounif` declaration (see Section 6.7.2). `Nounifset` does exactly that. `Term` automatically avoids some other unifications, to help termination, as determined by some heuristics. `NounifsetMaxsize` and `TermMaxsize` choose the fact of maximum size when there are several possibilities. This choice sometimes gives impressive speedups.

  When the selection function is set to `Nounifset` or `NounifsetMaxsize`; ProVerif will display a warning, and wait for a user response, when ProVerif thinks the solving process will not terminate. This behavior can be controlled by the following additional setting.

  - **`set stopTerm = true.`** / **`set stopTerm = false.`** — Display a warning and wait for user answer when ProVerif thinks the solving process will not terminate (`true`), or go on as if nothing had happened (`false`). (We reiterate that these settings are only available when the selection function is set to either `Nounifset` or `NounifsetMaxsize`.)

- **`set redundancyElim = best.`** / **`set redundancyElim = simple.`** / **`set redundancyElim = no.`**

  An elimination of redundant clauses has been implemented: when a clause without selected hypotheses is derivable from other clauses without selected hypothesis, it is removed. With `redundancyElim = simple`, this is applied for newly generated clauses. With `redundancyElim = best`, this is also applied on the reachable goals before proving a query. With `redundancyElim = no`, this is never applied. Detecting redundant clauses takes time, but redundancy elimination may also speed up the resolution when it eliminates clauses and simplify the final result of ProVerif. The consequences on speed depend on the considered protocol. By default, `set redundancyElim = best`.

- **`set redundantHypElim = beginOnly.`** / **`set redundantHypElim = false.`** / **`set redundantHypElim = true.`**

  When a clause is of the form `H && H′ -> C`, and there exists `σ` such that `σH ⊆ H′` and `σ` does not change the variables of `H′` and `C`, then the clause can be replaced with `H′ -> C` (since there are implications in both directions between these clauses). This replacement is done when `redundantHypElim` is set to `true`, or when it is set to `beginOnly` and `H` contains a `begin` fact (which is generated when events occur after `==>` in a query) or a blocking fact. Indeed, testing this property takes time, and slows down small examples. On the other hand, on big examples, in particular when they contain many events (or blocking facts), this technique can yield huge speedups.

- **`set removeEventsForLemma = false.`** / **`set removeEventsForLemma = true.`**

  When `removeEventsForLemma = true`, ProVerif removes event from clauses that are used only for applying lemmas, but do not seem useful anymore because the lemmas have already been applied or they will never be applicable using this event. It speeds up resolution and may even allow it to terminate. However, this removal is slightly approximate, so it may prevent a useful application of a lemma. (ProVerif remains sound in this case, but may lose precision. For this reason, to avoid losing too much precision, it is recommended not to combine options `removeEventsForLemma = true` and `preciseActions = trueWithoutArgsInNames`.) This option applies only to lemmas that are not declared with an explicit `removeEvents` or `keepEvents` option.

- **`set simpEqAll = false.`** / **`set simpEqAll = true.`**

  Part of how ProVerif handles an equational theory consists of extracting a convergent rewrite system representing the convergent part of the equational theory. During the saturation procedure, it is correct for ProVerif to only keep Horn clauses whose terms are in normal form w.r.t. the extracted rewrite system. When `simpEqAll = true`, ProVerif will check all the terms in the Horn clauses. When `simpEqAll = false` (default), ProVerif only checks specific predicates related to equivalence properties. Checking that all terms in Horn clauses is time consuming but it may also speed-up considerably the saturation procedure and resolve termination issues when it successfully removes Horn clauses.

- **`set eqInNames = false.`** / **`set eqInNames = true.`**

  This setting will probably not be used by most users. It influences the arguments of the functions that represent fresh names internally in ProVerif. When `eqInNames = false`, these arguments consist of variables defined by inputs, indices associated to replications, and terms that contain destructors defined by several rewrite rules, but do not contain other computed terms since their value is fixed knowing the arguments already included. When `eqInNames = true`, these arguments additionally include terms that contain constructors associated with several rewrite rules due to the equational theory. Because of these several rewrite rules, these terms may reduce to several syntactically different terms, which are all equal modulo the equational theory. In some rare examples, `eqInNames = true` speeds up the analysis because equality of the fresh names then implies that these terms are syntactically equal, so fewer clauses are considered. However, for technical reasons, `eqInNames = true` is incompatible with attack reconstruction.

- **`set preciseLetExpand = true.`** / **`set preciseLetExpand = false.`**

  This setting modifies the expansion of terms `let ... = ... in ... else ...`. By default (with the setting `set preciseLetExpand = true.`), they are expanded into processes `let` that define variables but never fail, and the test that decides whether the `in` branch or `else` branch is taken is encoded as a term. This expansion is more precise when proving observational equivalence with `choice`, but leads to a slower generation of the clauses for some examples. With the setting `set preciseLetExpand = false.`, terms `let ... = ... in ... else ...` are transformed into processes `let` that directly determine which branch is taken.

- **`set expandSimplifyIfCst = true.`** / **`set expandSimplifyIfCst = false.`**

  This setting modifies the expansion of terms to into processes. With `expandSimplifyIfCst = true`, if a process `if M then P else Q` occurs during this expansion and `M` is `true`, then this process is transformed into `P`. If this process occurs and `M` is `false`, then this process is transformed into `Q`. This transformation is useful because the expansion of terms into processes may introduce such tests with constant conditions. However, the transformation will be performed even if the constant was already there in the initial process, which may cut part of the process, and for instance remove restrictions that occur in the initial process and are needed for some queries or secrecy assumptions. With the setting `set expandSimplifyIfCst = false.`, this transformation is not performed.

- **`set nounifIgnoreAFewTimes = none.`** / **`set nounifIgnoreAFewTimes = auto.`** / **`set nounifIgnoreAFewTimes = all.`**

  This setting controls the default behavior of `noselect` and `nounif` declarations with respect to the `ignoreAFewTimes` option (see Section 6.7.2). When `nounifIgnoreAFewTimes = none`, the `noselect` and `nounif` declarations do not have the `ignoreAFewTimes` option unless it is explicitly mentioned. When `nounifIgnoreAFewTimes = auto`, the `noselect` and `nounif` declarations automatically guessed by ProVerif during resolution have the `ignoreAFewTimes` option. When `nounifIgnoreAFewTimes = all`, all positive `noselect` and `nounif` declarations and negative `select` declarations have the `ignoreAFewTimes` option.

- **`set nounifIgnoreNtimes = n.`** (default: `n = 1`)

  This option determines how many times `noselect` and `nounif` declarations with option `ignoreAFewTimes` are ignored. By default, they are ignored once.

- **`set symbOrder = "f₁ > ··· > fₙ".`**

  ProVerif uses a lexicographic path ordering in order to prove termination of convergent equational theories. By default, it uses a heuristic to build the ordering of function symbols underlying this lexicographic path ordering. This setting allows the user to set this ordering of function symbols.

- **`set featureFuns = true.`** / **`set featureFuns = false.`** / **`set featureNames = false.`** / **`set featureNames = true.`** / **`set featurePredicates = true.`** / **`set featurePredicates = false.`** / **`set featureEvents = true.`** / **`set featureEvents = false.`** / **`set featureTables = true.`** / **`set featureTables = false.`** / **`set featureDepth = false.`** / **`set featureDepth = true.`** / **`set featureWidth = false.`** / **`set featureWidth = true.`**

  ProVerif uses an indexing mechanism based on features of clauses [Sch13] to quickly eliminate clauses for which the subsumption test is certainly false. These settings determine which features are used in this indexing mechanism: ProVerif uses as features the number of hypotheses of the clause, and the number of occurrences of each predicate (when `featurePredicates = true`), event (when `featureEvents = true`), and table (when `featureTables = true`) symbol in the hypothesis and in the conclusion of the clause. It also uses, for each function (when `featureFuns = true`) and name (when `featureNames = true`) symbol, either its number of occurrences and its maximum depth in the hypothesis and in the conclusion of the clause (when `featureDepth = false`) or the number of its occurrences at each depth in the hypothesis and in the conclusion of the clause (when `featureDepth = true`), as well as its number of occurrences at each width in the hypothesis and in the conclusion of the clause (when `featureWidth = true`; a symbol `f` occurs at width `w` in a fact `F` when it is at the root of the `w`-th argument of the symbol immediately above `f`, i.e., `F = C[g(M₁,...,M_{w-1}, f(...), M_{w+1}, ..., Mₙ)]`). Finally, ProVerif also uses the total number of occurrences in the hypothesis and in the conclusion of the clause of any function or name symbol not used in the previous features.

#### Attack reconstruction settings

- **`set simplifyDerivation = true.`** / **`set simplifyDerivation = false.`**

  Should the derivation be simplified by removing duplicate proofs of the same attacker facts?

- **`set abbreviateDerivation = true.`** / **`set abbreviateDerivation = false.`**

  When `abbreviateDerivation = true`, ProVerif defines symbols to abbreviate terms that represent names `a[...]` before displaying the derivation, and uses these abbreviations in the derivation. These abbreviations generally make the derivation easier to read by reducing the size of terms.

- **`set explainDerivation = true.`** / **`set explainDerivation = false.`**

  When `explainDerivation = true`, ProVerif explains in English each step of the derivation (returned in case of failure of a proof). This explanation refers to program points in the given process. When `explainDerivation = false`, it displays the derivation by referring to the clauses generated initially.

- **`set reconstructTrace = n.`** (default `n = 4`) / **`set reconstructTrace = true.`** / **`set reconstructTrace = false.`**

  With `reconstructTrace = true`, when a query cannot be proved, the tool tries to build a pi calculus execution trace that is a counter-example to the query [AB05c]. With `reconstructTrace = false`, the tool does not try to reconstruct a trace. With `reconstructTrace = n`, it tries to reconstruct a trace at most `n` times for each query. Trace reconstruction is currently incompatible with key compromise (that is, when `keyCompromise` is set to either `approx` or `strict`). Moreover, for `noninterf` and `choice`, it reconstructs a trace, but this trace may not always prove that the property is wrong: for `noninterf`, it reconstructs a trace until a program point at which the process behaves differently depending on the value of the secret (takes a different branch of a test, for instance), but this different behavior is not always observable by the attacker; similarly, for `choice`, it reconstructs a trace until a program point at which the process using the first argument of `choice` behaves differently from the process using the second argument of `choice`.

- **`set unifyDerivation = true.`** / **`set unifyDerivation = false.`**

  When set to `true`, activates a heuristic that increases the chances of finding a trace that corresponds to a derivation. This heuristic unifies messages received by the same input (same occurrence and same session identifiers) in the derivation. Indeed, these messages must be equal if the derivation corresponds to a trace.

- **`set reconstructDerivation = true.`** / **`set reconstructDerivation = false.`**

  When a fact is derivable, should we reconstruct the corresponding derivation? (This setting has been introduced because in some extreme cases reconstructing a derivation can consume a lot of memory.)

- **`set displayDerivation = true.`** / **`set displayDerivation = false.`**

  Should the derivation be displayed? Disabling derivation display is useful for very big derivations.

- **`set traceBacktracking = true.`** / **`set traceBacktracking = false.`**

  Allow or disable backtracking when reconstructing traces. In most cases, when traces can be found, they are found without backtracking. Disabling backtracking makes it possible to display the trace during its computation, and to forget previous states of the trace. This reduces memory consumption, which can be necessary for reconstructing very big traces.

#### Swapping settings

- **`set interactiveSwapping = false.`** / **`set interactiveSwapping = true.`**

  By default, in order to prove observational equivalence in the presence of synchronization (see Section 4.3.2), ProVerif tries all swapping strategies. With the setting `interactiveSwapping = true`, it asks the user which swapping strategy to use.

- **`set swapping = "swapping strategy".`**

  This setting determines which swapping strategy to use in order to prove observational equivalence in the presence of synchronization. See Section 4.3.2 for more details, in particular the syntax of swapping strategies.

#### Display settings

- **`set color = false.`** / **`set color = true.`**

  Display a colored output on terminals that support ANSI color codes. (Will result in a garbage output on terminals that do not support these codes.) Unix terminals typically support ANSI color codes. For emacs users, you can run ProVerif in a shell buffer with ANSI color codes as follows:

  - start a shell with `M-x shell`
  - load the `ansi-color` library with `M-x load-library RET ansi-color RET`
  - activate ANSI colors with `M-x ansi-color-for-comint-mode-on`
  - now run ProVerif in the shell buffer

  You can also activate ANSI colors in shell buffers by default by adding the following to your `.emacs`:

  ```
  (autoload 'ansi-color-for-comint-mode-on "ansi-color" nil t)
  (add-hook 'shell-mode-hook 'ansi-color-for-comint-mode-on)
  ```

  This option is active by default when the output is a terminal, on Unix (including Mac).

- **`set traceDisplay = short.`** / **`set traceDisplay = long.`** / **`set traceDisplay = none.`**

  Choose the format in which the trace is displayed after trace reconstruction. By default (`traceDisplay = short.`), outputs the labels of a labeled reduction. With `set traceDisplay = long.`, outputs the current state before each input and before and after each I/O reduction, as well as the list of all executed reductions. With `set traceDisplay = none.`, the trace is not displayed.

- **`set verboseClauses = none.`** / **`set verboseClauses = explained.`** / **`set verboseClauses = short.`**

  When `verboseClauses = none`, ProVerif does not display the clauses it generates. When `verboseClauses = short`, it displays them. When `verboseClauses = explained`, it adds an English sentence after each clause it generates to explain where this clause comes from.

- **`set verboseLemmas = false.`** / **`set verboseLemmas = true.`**

  When `verboseLemmas = true`, ProVerif displays the lemmas, axioms and inductive hypotheses that are used during the saturation and/or the verification procedures (see Sections 6.1 and 6.2).

- **`set abbreviateClauses = true.`** / **`set abbreviateClauses = false.`**

  When `abbreviateClauses = true`, ProVerif defines symbols to abbreviate terms that represent names `a[...]` and uses these abbreviations in the display of clauses. These abbreviations generally make the clauses easier to read by reducing the size of terms.

- **`set removeUselessClausesBeforeDisplay = true.`** / **`set removeUselessClausesBeforeDisplay = false.`**

  When `removeUselessClausesBeforeDisplay = true`, ProVerif removes subsumed clauses and tautologies from the initial clauses before displaying them, to avoid showing many useless clauses. When `removeUselessClausesBeforeDisplay = false`, all generated clauses are displayed.

- **`set verboseEq = true.`** / **`set verboseEq = false.`**

  Display information on handling of equational theories when `true`.

- **`set verboseDestructors = true.`** / **`set verboseDestructors = false.`**

  Display information on handling of destructors' rewrite rules when `true`.

- **`set verboseTerm = true.`** / **`set verboseTerm = false.`**

  Display information on termination when `true` (changes in the selection function to improve termination; termination warnings).

- **`set verboseStatistics = false.`** / **`set verboseStatistics = true.`**

  `set verboseStatistics = true` displays the statistics of the database every time it is modified. This is useful to determine whether ProVerif entered a loop in the normalisation of a clause or if it is just slow. This option is active by default when the output is a terminal, on Unix (including Mac). For this option to work properly, either one must be under Unix (ProVerif must be able to determine the number of columns of the terminal and the terminal must support ANSI escape codes) or the statistics must fit on one line.

- **`set verboseRules = false.`** / **`set verboseRules = true.`**

  Display the number of clauses every 200 clause created during the solving process (`false`) or display each clause created during the solving process (`true`).

- **`set verboseBase = false.`** / **`set verboseBase = true.`**

  When `true`, display the current set of clauses at each resolution step during the solving process.

- **`set verboseRedundant = false.`** / **`set verboseRedundant = true.`**

  Display eliminated redundant clauses when `true`.

- **`set verboseCompleted = false.`** / **`set verboseCompleted = true.`**

  Display completed set of clauses after saturation when `true`.

- **`set verboseGoalReachable = true.`** / **`set verboseGoalReachable = false.`**

  When `verboseGoalReachable = true`, ProVerif displays each derivable clause that satisfies the query. When `verboseGoalReachable = false`, these clauses are not displayed when the query is `true`; only their number is displayed. That shortens the display for complex protocols.

## 6.7 Theory and tricks

In this section, we discuss tricks to get the most from ProVerif for advanced users. These tricks may improve performance and aid termination. We also propose alternative ways to encode protocols and pi calculus encodings for some standard features. We also detail sources of incompleteness of ProVerif, for a better understanding of when and why false attacks happen.

**User tricks.** You are invited to submit your own ProVerif tricks, which we may include in future revisions of this manual.

### 6.7.1 The resolution strategy of ProVerif

ProVerif represents protocols internally by Horn clauses, and the resolution algorithm [Bla11] combines clauses: from two clauses `R` and `R′`, it generates a clause `R ∘ R′` defined as follows

```
R = H -> C        R′ = F₀ && H′ -> C′
-------------------------------------
   R ∘_{F₀} R′ = σH && σH′ -> σC′
```

where `σ` is the most general unifier of `C` and `F₀`, `C` is selected in `R`, and `F₀` is selected in `R′`. The selected literal of each clause is determined by a selection function, which can be chosen by `set selFun = name.`, where `name` is the name of the selection function, `Nounifset`, `NounifsetMaxsize`, `Term`, or `TermMaxsize`. The selection functions work as follows:

- Hypotheses of the form `p(...)` when `p` is declared with option `block` and internal predicates `begin` and `testunif` are unselectable. (The predicate `testunif` is handled by a specific internal treatment. The predicates with option `block` and the predicate `begin` have no clauses that conclude them; the goal is to produce a result valid for any definition of these predicates, so they must not be selected.) The conclusion `bad` is also unselectable. (The goal is to determine whether `bad` is derivable, so we should select a hypothesis if there is some, to determine whether the hypothesis is derivable.) Facts `p(x)` when `p` is an internal predicate `attacker` or `comp` are also unselectable. (Due to data-decomposition clauses, selecting such facts would lead to non-termination.) Unselectable hypotheses are never selected. An unselectable conclusion is selected only when all hypotheses are unselectable (or there is no hypothesis).
- If there is a selectable literal, the selection function selects the literal of maximum weight among the selectable literals. In case several literals have the maximum weight, the conclusion is selected in priority if it has the maximum weight, then the first hypothesis with maximum weight is selected. The weight of each literal is determined as follows:
  - If the selection function is `Term` or `TermMaxsize` (the default), and a hypothesis is a looping instance of the conclusion, then the conclusion has weight −7000. (A fact `F` is a looping instance of a fact `F′` when there is a substitution `σ` such that `F = σF′` and `σ` maps some variable `x` to a term that contains `x` and is not a variable. In this case, repeated instantiations of `F′` by `σ` generate an infinite number of distinct facts `σⁿF′`.) The goal has weight −3000. (The goal is the fact for which we want to determine whether it is derivable or not. It appears as a conclusion in the second stage of ProVerif's resolution algorithm.) If the conclusion is a fact `F` whose weight has been manually set by a declaration `select`, `noselect`, or `nounif ... [conclusion]` (see Section 6.7.2), then the conclusion has the weight in question. In all other cases, the conclusion has weight −1.
  - If the selection function is `Term` or `TermMaxsize` (the default), and the conclusion is a looping instance of a hypothesis, then this hypothesis has weight −7000. If the hypothesis is a fact `F` whose weight has been set by a declaration `select`, `noselect`, or `nounif` (see Section 6.7.2) or by a previous selection step (see below), then the hypothesis has the weight in question. All other hypotheses have as weight their size with the selection functions `TermMaxsize` (the default) and `NounifsetMaxsize`. They have weight 0 with the selection functions `Term` and `Nounifset`.
- If the selection function is `Term` or `TermMaxsize` (the default) and the conclusion is selected in a clause, then for each hypothesis `F` of that clause such that the conclusion `C` is a looping instance of `F` (`C = σF`), the weight of hypotheses `σ′F`, where `σ` and `σ′` have disjoint supports, is set to −5000 for the rest of the resolution. (`σ` and `σ′` have disjoint supports means that, if `σx` is not a variable, then `σ′x` must be a variable.)

The selection functions `Term` and `TermMaxsize` try to favor termination by auto-detecting loops and tuning the selection function to avoid them. For instance, suppose that the conclusion is a looping instance of a hypothesis, so the clause is of the form `H && F -> σF`.

- Assume that `F` is selected in this clause, and there is a clause `H′ -> F′`, where `F′` unifies with `F`, and the conclusion is selected in `H′ -> F′`. Let `σ′` be the most general unifier of `F` and `F′`. So the algorithm generates:

  ```
  σ′H′ && σ′H -> σ′σF
  ...
  σ′H′ && σ′H && σ′σH && ... && σ′σⁿ⁻¹H -> σ′σⁿF
  ```

  assuming that the conclusion is selected in all these clauses, and that no clause is removed because it is subsumed by another clause. So the algorithm would not terminate. Therefore, in order to avoid this situation, we should avoid selecting `F` in the clause `H && F -> σF`. That is why we give `F` weight −7000 in this case. A symmetric situation happens when a hypothesis is a looping instance of the conclusion, so we give weight −7000 to the conclusion in this case.

- Assume that the conclusion is selected in the clause `H && F -> σF`, and there is a clause `H′ && σ′F -> C` (up to renaming of variables), where `σ′` commutes with `σ` (in particular, when `σ` and `σ′` have disjoint supports), and that `σ′F` is selected in this clause. So the algorithm generates:

  ```
  σ′H && σH′ && σ′F -> σC
  ...
  σ′H && σ′σH && ... && σ′σⁿ⁻¹H && σⁿH′ && σ′F -> σⁿC
  ```

  assuming that `σ′F` is selected in all these clauses, and that no clause is removed because it is subsumed by another clause. So the algorithm would not terminate. Therefore, in order to avoid this situation, if the conclusion is selected in the clause `H && F -> σF`, we should avoid selecting facts of the form `σ′F`, where `σ′` and `σ` have disjoint supports, in other clauses. That is why we automatically set the weight to −5000 for these facts.

Obviously, these heuristics do not avoid all loops. One can use manual `select`, `noselect`, or `nounif` declarations to tune the selection function further, as explained in Section 6.7.2.

The selection functions `TermMaxsize` and `NounifsetMaxsize` preferably select large facts. This can yield important speed-ups for some examples.

### 6.7.2 Performance and termination

#### Secrecy assumptions

Secrecy assumptions may be added to ProVerif scripts in the form:

```
not x₁ : t₁,...,xₙ : tₙ; F .
```

which states that `F` cannot be derived, where `F` can be a fact `attacker(M)`, `attacker(M) phase n`, `mess(N,M)`, `mess(N,M) phase n`, `table(d(M₁,...,Mₙ))`, `table(d(M₁,...,Mₙ)) phase n` as defined in Figure 4.3 or a user-defined predicate `p(M₁,...,Mₖ)` (see Section 6.3). When `F` contains variables, the secrecy assumption `not x₁ : t₁,...,xₙ : tₙ; F.` means that no instance of `F` is derivable.

ProVerif can then optimize its internal clauses by removing clauses that contain `F` in hypotheses, thus simplifying the clause set and resulting in a performance advantage. The use of secrecy assumptions preserves soundness because ProVerif also checks that `F` cannot be derived; if it can be derived, ProVerif fails with an error message. Secrecy assumptions can be extended using the binding `let x = M in` and bound names designated by `new a[...]` as discussed in Section 6.4; these two constructs are allowed as part of `F`.

The name "secrecy assumptions" comes from the particular case

```
not attacker(M).
```

which states that `attacker(M)` cannot be derived, that is, `M` is secret.

Secrecy assumptions may also be added when proving equivalence between two processes `P` and `Q`. For example, in the declaration

```proverif
free k: bitstring [private ].
not attacker(k).
```

the assumption `not attacker(k)` indicates that `k` cannot be deduced by the attacker in `P` and `Q` at the same time. Secrecy assumptions can also differ between `P` and `Q` using `choice`. The declaration

```proverif
not attacker(choice[k1,k2]).
```

indicates that the attacker cannot deduce `k1` in `P` and `k2` in `Q` at the same time. Note that if the attacker can deduce `k1` in `P` but is not able to deduce `k2` in `Q` then the secrecy assumption is satisfied. As such, it is possible to declare a secrecy assumption only for `P` as follows.

```proverif
not x: bitstring ; attacker(choice[k,x]).
```

This secrecy assumption intuitively only indicates that the attacker cannot deduce `k` in `P` but does not say anything about `Q`.

#### Grouping queries

As mentioned in Section 6.1, queries may also be stated in the form:

```
query x₁ : t₁,...,xₘ : tₘ; q₁;...;qₙ.
```

where each `qᵢ` is a query as defined in Figure 4.3, or a `putbegin` declaration (see Section 6.5). A single query declaration containing `q₁;...;qₙ` is evaluated by building one set of clauses and performing resolution on it, whilst independent query declarations

```
query x₁ : t₁,...,xₘ : tₘ; q₁.
. . .
query x₁ : t₁,...,xₘ : tₘ; qₙ.
```

are evaluated by rebuilding a new set of clauses from scratch for each `qᵢ`. So the way queries are grouped influences the sharing of work between different queries, and therefore performance. For optimization, one should group queries that involve the same events; but separate queries that involve different events, because the more events appear in the query, the more complex the generated clauses are, which can slow down ProVerif considerably, especially on complex examples. If one does not want to optimize, one can simply put a single query in each query declaration.

#### Tuning the resolution strategy

The resolution strategy can be tuned using declarations:

```
select x₁ : t₁,...,xₖ : tₖ; F/w [o₁,...,oₙ].
noselect x₁ : t₁,...,xₖ : tₖ; F/w [o₁,...,oₙ].
nounif x₁ : t₁,...,xₖ : tₖ; F/w [o₁,...,oₙ].
```

The fact `F` can be `attacker(M)`, `attacker(M) phase n`, `mess(N,M)`, `mess(N,M) phase n`, `table(d(M₁,...,Mₘ))`, `table(d(M₁,...,Mₘ)) phase n` as defined in Figure 4.3 or a user-defined predicate `p(M₁,...,Mₘ)` (see Section 6.3), and `F` can also include the construct `new a[...]` to designate bound names and `let` bindings `let x = M in` (see Section 6.4). The fact `F` may contain two kinds of variables: ordinary variables match only variables, while star variables, of the form `*x` where `x` is a variable name, match any term.

The indications `x₁ : t₁,...,xₖ : tₖ` specify the types of the variables `x₁,...,xₖ` that occur in `F`.

The declaration `select` adjusts the selection function to give weight `w` to facts that match `F`. The declarations `noselect` and `nounif` are equivalent and adjust the selection function to give weight `−w` to facts that match `F`. (See the resolution algorithm explained in Section 6.7.1.) When the weight is positive, that encourages ProVerif to resolve upon facts that match `F`; the larger the weight, the more ProVerif is encouraged to resolve upon facts that match `F`. When the weight is negative, that prevents ProVerif from resolving upon facts that match `F`. The lower the weight, the more such resolutions will be avoided. By default, only the weight of hypotheses that match `F` is modified; the weight of conclusions that match is left unchanged. The options `o₁,...,oₙ` may modify that as detailed below. The minimum weight that can be set is −9999. If the weight given by the user is less than −9999, the weight will be set to −9999. The integer `w` can be omitted, by removing `/w` from the declaration. When `w` is not mentioned, the weight is set to 3000 for `select` and to −6000 for `noselect` and `nounif`. This weight is such that, by default, manual `noselect` and `nounif` declarations have priority over automatic weight assignments (weight −5000), but have lower priority than situations in which the conclusion is a looping instance of a hypothesis or conversely (weight −7000). One can adjust the weight manually to obtain different priority levels.

The options `o₁,...,oₙ` specify further how the `select`, `noselect`, and `nounif` declaration applies. The allowed options are:

- **`hypothesis`, `conclusion`:** When the option `conclusion` is not mentioned (e.g., `nounif x₁ : t₁,...,xₖ : tₖ; F/w [hypothesis].` or `nounif x₁ : t₁,...,xₖ : tₖ; F/w.`), the declaration modifies the weight of hypotheses matching `F` and leaves the weight of conclusions matching `F` unchanged. When the option `conclusion` alone is mentioned (e.g., `nounif x₁ : t₁,...,xₖ : tₖ; F/w [conclusion].`), the declaration modifies the weight of conclusions matching `F` and leaves the weight of hypotheses matching `F` unchanged. When the option `conclusion` and another option are mentioned (e.g., `nounif x₁ : t₁,...,xₖ : tₖ; F/w [hypothesis,conclusion].`), the declaration modifies the weight of both hypotheses and conclusions matching `F`. For example, the declarations

  ```proverif
  nounif x₁ : t₁,...,xₖ : tₖ ; F/w1.
  nounif x₁ : t₁,...,xₖ : tₖ ; F/w2 [conclusion ].
  ```

  indicate that the weight of conclusions matching `F` is `−w2` whereas the weight of hypotheses matching `F` is `−w1`.

- **`ignoreAFewTimes`:** This option is accepted only when the weight is negative, that is `w > 0` for `noselect` and `nounif` declarations, and `w < 0` for `select` declarations. The `nounif` declarations help the saturation procedure to terminate but they may lower the precision of ProVerif by preventing resolution steps. In the second stage of the resolution algorithm, i.e. after saturation has completed and when ProVerif determines whether the goal is derivable or not, we allow a hypothesis `F` in a clause `F ∧ H -> C` matching a `nounif` declaration with option `ignoreAFewTimes` to be selected instead of selecting the conclusion `C`. To prevent the non-termination issue, such selection, which ignores the `nounif` declaration, can only happen a limited number of times, determined by the setting `set nounifIgnoreNtimes = n.` (By default, it happens only once.) When we resolve `F ∧ H -> C` with `H′ -> C′` upon `F` ignoring a `nounif` declaration and that yields a clause `σH′∧σH ->σC`, we consider that the `nounif` have already been ignored once for all facts in `σH′`, so if `nounif` declarations could be ignored `n` times for `F`, then they can be ignored `n−1` times for facts in `σH′`. With the default setting, the `nounif` declarations can no longer be ignored for facts in `σH′`.

  For example, consider a clause among the saturated clauses such that the conclusion is a looping instance of an hypothesis, so the clause is of the form `H ∧ F -> σF`. Suppose now that during the second step of ProVerif's algorithm, a clause `F -> C` needs to be resolved. Since `σF` is a looping instance of `F`, ProVerif would have automatically associated to `F` the weight −5000. In such a case, the conclusion `C` would be selected and the clause `F -> C` would be considered as resolved. By declaring

  ```proverif
  nounif x₁ : t₁,...,xₖ : tₖ ; F [ignoreAFewTimes].
  ```

  the hypothesis `F` in `F -> C` is selected and allows a resolution step on `F`. Among possibly others, this will generate the clause `H ∧ F -> σC`. However on this new clause, `F` will not be selected since it was already selected in `F -> C` and this clause was used to generate `H ∧ F -> σC`.

  The option `ignoreAFewTimes` is best used when proving a query by induction as it may allow ProVerif to apply additional inductive hypotheses. Let us come back to the simplified Yubikey protocol `docs/ex_induction_group.pv` introduced in Section 6.1.

  ```proverif
 1    free c:channel.
 2    free k: bitstring [private ].
 3    free d_P:channel [private].
 4    free d_Q:channel [private].
 5
 6    fun senc(nat , bitstring ): bitstring .
 7    reduc forall K: bitstring ,M:nat; sdec(senc(M,K),K) = M.
 8
 9    event CheckNat(nat).
10    event CheckNatQ(nat).
11
12    query i :nat;
13        event(CheckNat(i )) ==> is nat(i );
14        event(CheckNatQ(i )) ==> is nat(i );
15        mess(d_Q, i ) ==> is nat(i) [induction].
16
17    let P =
18        in(c,x: bitstring );
19        in(d_P,( i :nat , j : nat ));
20        let j ': nat = sdec(x,k) in
21        event CheckNat(i );
22        event CheckNat(j );
23        event CheckNatQ(j ');
24        if   j '   > j
25        then out(d_P,( i+1,j '))
26        else out(d_P,(i , j )).
27
28    let Q =
29        in(d_Q, i : nat );
30        out(c,senc(i ,k));
31        out(d_Q, i+1).
32
33    process
34      out(d_P,(0 ,0)) | out(d_Q,0) | ! P | ! Q
  ```

  ProVerif is not able to prove the query `mess(d_Q,i) ==> is nat(i)`. By looking at the output of ProVerif on the execution of `docs/ex_induction_group.pv`, one can notice the following:

  - ProVerif automatically assigns weight −5000 to `mess(d_Q[],i_2)`, which is displayed `select mess(d_Q[],i_2)/−5000`, because the process `Q` generates the Horn clause `mess(d_Q,i) -> mess(d_Q,i+1)` where the conclusion is a looping instance of the hypothesis.
  - ProVerif generates the reachable goal `is not nat(i_2) && mess(d_Q[],i_2) -> mess(d_Q[],i_2)`. Because of the `nounif` declaration, ProVerif does not try to solve the hypothesis `mess(d_Q[],i_2)` which prevents it from proving the query.

  To help ProVerif, one can add in the input file the `nounif` declaration on `mess(d_Q[],i_2)` with the option `ignoreAFewTimes` to allow ProVerif to resolve once upon the fact `mess(d_Q[],i_2)` during the verification procedure. In the file `docs/ex_induction_group_proof.pv`, we added the line

  ```proverif
 12    nounif i :nat; mess(d_Q, i) [ignoreAFewTimes].
  ```

  By looking at the output of the execution of `docs/ex_induction_group_proof.pv`, one can notice that ProVerif is able to prove all queries and in particular, it generates the following reachable goals for the query `mess(d_Q,i) ==> is nat(i)`:

  ```
  goal reachable: is nat(i_2) && mess(d_Q[] , i_2) -> mess(d_Q[] , i_2 + 1)
  goal reachable: mess(d_Q[] ,0)
  ```

- **`inductionOn=i`:** This option is accepted only when the weight is negative, that is `w > 0` for `noselect` and `nounif` declarations, and `w < 0` for `select` declarations. `i` must be a variable of type `nat` that has been declared in the environment of the `noselect`, `nounif`, `select` declaration (i.e., `i` is one of the variables `x₁,...,xₖ`), `i` must occur in `F`, but `*i` must not occur in `F`. During the saturation procedure, when a clause is of the form `Fσ₁ ∧ Fσ₂ ∧ H -> C` where `H` implies `iσ₁ ≥ iσ₂`, the hypotheses containing the variable `iσ₂` will be removed from the clause. Due to the presence of natural numbers, the saturation procedure may not terminate in some cases because it generates infinitely many clauses of the following form `H∧F(j₁)∧j₁ < j₂∧F(j₂)∧j₂ < j₃∧F(j₃)∧... -> C` that may not be removed by subsumption. This usually occurs when the facts `F(j₁),F(j₂),...` are unselectable (e.g. events) or match a `nounif`. In our example, adding the option `inductionOn=i` may ensure termination as it will simplify the clauses into `H ∧ F(j) -> C`. Note that similarly to the setting `set maxHyp = n.`, this option can be used to ensure termination at the cost of precision. However, this option is best used when proving a query by induction, specifically when `F` is part of the goal of the query and when `iσ₁ ≥ iσ₂` implies that `Fσ₁` occurs after `Fσ₂`. In such a case, the application of the inductive hypothesis on `Fσ₁` may be precise enough to prove the query by induction. When `F` contains multiple natural variables, one can add the option `inductionOn={i₁,...,iₙ}`. In such a case, the hypotheses containing the variables `i₁σ₂,...,iₙσ₂` will be removed from the clause when `H` implies `∧ₖ₌₁..ₙ iₖσ₁ ≥ iₖσ₂`.

In order to determine the desired `select`, `noselect`, and `nounif` declarations, one typically uses `set verboseRules = true.` to display the clauses generated by ProVerif. One can then observe the loops that occur, and one can try to avoid them by using a `nounif` declaration that prevents the selection of the literal that causes the loop.

#### Tagged protocols

A typical cause of non-termination of ProVerif is the existence of loops inside protocols. Consider for instance a protocol with the following messages:

```
B→A: senc(Nb, k)
A→B: senc(f(Nb), k)
```

(This example is inspired from the Needham-Schroeder shared-key protocol.) Suppose that `A` does not know the value of `Nb` (nonce generated by `B`). In this case, in `A`'s role, `Nb` is a variable. Then, the attacker can send the second message to `A` as if it were the first one, and obtain as reply `senc(f(f(Nb)), k)`, which can itself be sent as if it were the first message, and so on, yielding to a loop that generates `senc(fⁿ(Nb), k)` for any integer `n`.

A way to avoid such loops is to add tags. A tag is a distinct constant for each application of a cryptographic primitive (encryption, signatures, ...) in the protocol. Instead of applying the primitive just to the initial message, one applies it to a pair containing a tag and the message. For instance, after adding tags, the previous example becomes:

```
B→A: senc((c0, Nb), k)
A→B: senc((c1, f(Nb)), k)
```

After adding tags, the second message cannot be mixed with the first one because of the different tags `c0` and `c1`, so the previous loop is avoided. More generally, one can show that ProVerif always terminates for tagged protocols (modulo some restrictions on the primitives in use and on the properties that are proved) [BP05], [Bla09, Section 8.1]. Adding tags is a good design practice [AN96]: the tags facilitate the parsing of messages, and they also prevent type-flaw attacks (in which messages of different types are mixed) [HLS00]. Tags are used in some practical protocols such as SSH. However, if one verifies a protocol with tags, one should implement the protocol with these tags: the security of the tagged protocol does not imply the security of the untagged version.

#### Position and arguments of new

Internally, fresh names created by `new` are represented as functions of the inputs located above that `new`. So, by moving `new` upwards or downwards, one can influence the internal representation of the names and tune the performance and precision of the analysis. Typically, the more the `new` are moved downwards in the process, the more precise and the more costly the analysis is. (There are exceptions to this general rule, see for example the end of Section 5.4.2.)

The setting `set movenew = true.` allows one to move `new` automatically downwards, potentially yielding a more precise analysis. By default, the `new` are left where they are, so the user can manually tune the precision of the analysis. Furthermore, it is possible to indicate explicitly at each replication which variables should be included as arguments in the internal representation of the corresponding fresh name: inside a process

```
new a[x₁,...,xₙ]:t
```

means that the internal representation of names created by that restriction is going to include `x₁,...,xₙ` as arguments. In any case, the internal representation of names always includes session identifiers (necessary for soundness) and variables needed to answer queries. These annotations are ignored in the case of observational equivalence proof between two processes (keyword `equivalence`) or when the biprocess is simplified before an observational equivalence proof. (Otherwise, the transformations of the processes might be prevented by these annotations.)

In general, we advise generating the fresh names by `new` when they are needed. Generating all fresh names at the beginning of the protocol is a bad idea: the names will essentially have no arguments, so ProVerif will merge all of them and the analysis will be so imprecise that it will not be able to prove anything. On the other hand, if the `new` take too many arguments, the analysis can become very costly or even not terminate. By the setting `set verboseRules = true.`, one can observe the clauses generated by ProVerif; if these clauses contain names with very large arguments that grow more and more, moving `new` upwards or giving an explicit list of arguments to remove some arguments can improve the speed of ProVerif or make it terminate. The size of the arguments of names associated with random coins is the reason of the cost of the analysis in the presence of probabilistic encryption (see Section 4.2.3). When one uses function macros to represent encryption, one cannot easily move the `new` upwards. If needed, we advise manually expanding the encryption macro and moving the `new` that comes from this macro upwards or giving it explicit arguments.

#### Additional arguments of events

In order to prove injective correspondences such as

```
query x₁ : t₁,...,xₙ : tₙ; inj-event(e(M₁,...,Mⱼ)) ==> inj-event(e′(N₁,...,Nₖ)).
```

ProVerif adds a name with arguments to the injective event `e` that occur after the arrow. Injectivity is proved when the session identifier of the event `e` occurs in those arguments. By default, ProVerif puts as many arguments as possible in that name. In some examples, this may lead to a loop or to a slow resolution. So ProVerif allows the user to specify which arguments should be given to that name, by adding the desired arguments between brackets in the process:

```
event(e′(N′₁,...,N′ₖ))[x₁,...,xₗ]; P .
```

puts variables `x₁,...,xₗ` as arguments in the name added to event `e′`. When no argument is mentioned:

```
event(e′(N′₁,...,N′ₖ))[]; P .
```

ProVerif uses the arguments of the event instead, here `N′₁,...,N′ₖ`. Typically, the arguments should include a fresh name (e.g., a nonce) created by the process that contains event `e`, and received by the process that contains event `e′`, before executing `e′`.

### 6.7.3 Alternative encodings of protocols

#### Key distribution

In Section 4.1.5, we introduced tables and demonstrated their application for key distribution with respect to the Needham-Schroeder public key protocol (Sections 5.2 and 5.3). There are three further noteworthy key distribution methods which we will now discuss.

1. **Key distribution by scope.** The first alternative key distribution mechanism simply relies on variable scope and was used in our exemplar handshake protocol and in Section 5.1 without discussion. In this formalism, we simply ensure that the required keys are within the scope of the desired processes. The main limitation of this encoding is that it does not allow one to establish a correspondence between host names and keys for an unbounded number of hosts.

2. **Key distribution over private channels.** In an equivalent manner to tables, keys may be distributed over private channels.
   - Instead of declaring a table `d`, we declare a private channel by `free cd: channel [private]`.
   - Instead of inserting an element, say `(h,k)`, in table `d`, we output an unbounded number of copies of that element on channel `cd` by `!out(cd, (h,k))`. (The rest of the process should be in parallel with that output so that it does not get replicated as well.)
   - Instead of getting an element, say by `get(d, (=h,k))` to get the key `k` for host `h`, we read on the private channel `cd` by `in(cd, (=h,k:key))`.

   With this encoding, all keys inserted in the table become available (in an unbounded number of copies) on the private channel `cd`.

   We present this encoding as an example of what can be done using private channels. It does not have advantages with respect to using the specific ProVerif constructs for inserting and getting elements of tables.

3. **Key distribution by constructors and destructors.** Finally, as we alluded in Section 3.1.1, private constructors can be used to model the server's key table. In this case, we make use of the following constructors and associated destructors:

   ```proverif
   type host.
   type skey.
   type pkey.
   fun pk(skey): pkey.
   fun fhost(pkey): host.
   reduc x:pkey; getkey(fhost(x)) = x [private].
   ```

   The constructor `fhost` generates a host name from a public key, while the destructor `getkey` returns the public key from the host name. The constructor `fhost` is public so that the attacker can create host names for the keys it creates. The destructor `getkey` is private; this is not essential for public keys, but when this technique is used with long-term secret keys rather than public keys, it is important that `getkey` be private so that the attacker cannot obtain all secret keys from the (public) host names.

   This technique allows one to model an unbounded number of participants, each with a distinct key. This is however not necessary for most examples: one honest participant for each role is sufficient, the other participants can be considered dishonest and included in the attacker. An advantage of this technique is that it sometimes makes it possible for ProVerif to terminate while it does not terminate with the table of host names and keys used in previous chapters (because host names and keys that are complex terms may be registered by the attacker). For instance, in the file `examples/pitype/choice/NeedhamSchroederPK-corr1.pv` (if you installed by OPAM in the switch ⟨switch⟩, the file `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/choice/NeedhamSchroederPK-corr1.pv`), we had to perform key registration in an earlier phase than the protocol in order to obtain termination. Using the `fhost`/`getkey` encoding, we can obtain termination with a single phase (see `examples/pitype/choice/NeedhamSchroederPK-corr1-host-getkey.pv`). However, this encoding also has limitations: for instance, it does not allow the attacker to register several host names with the same key, which is sometimes possible in reality, so this can lead to missing some attacks.

#### Bound and private names

The following three constructs are essentially equivalent: a free name declared by `free n:t`, a constant declared by `const n:t`, and a bound name created by `new n:t` not under any replication in the process. They all declare a constant. However, in queries, bound names must be referred to by `new n` rather than `n` (see Section 6.4). Moreover, from a semantic point of view, it is much easier to define the meaning of a free name or a constant in a query than a reference to a bound name. (The bound name can be renamed, and the query is not in the scope of that name.) For this reason, we recommend using free names or constants rather than bound names in queries when possible.

### 6.7.4 Applied pi calculus encodings

The applied pi calculus is a powerful language that can encode many features (including arithmetic!), using private channels and function symbols. ProVerif cannot handle all of these encodings: it may not terminate if the encoding is too complex. It can still take advantage of the power of the applied pi calculus in order to encode non-trivial features. This section presents a few examples.

#### Asymmetric channels

Up to now, we have considered only public channels (on which the attacker can read and write) and private channels (on which the attacker can neither read nor write). It is also possible to encode asymmetric channels (on which the attacker can either read or write, but not both).

- A channel `cwrite` on which the attacker can write but not read can be encoded as follows: declare `cwrite` as a private channel by `free cwrite:channel [private].` and add in your process `!in(c, x:t); out(cwrite, x)` where `c` is a public channel. This allows the attacker to send any value of type `t` on channel `cwrite`, and can be done for several types if desired. When types are ignored (the default), it in fact allows the attacker to send any value of any type on channel `cwrite`.
- A channel `cread` on which the attacker can read but not write can be encoded as follows: declare `cread` as a private channel by `free cread:channel [private].` and add in your process `!in(cread, x:t); out(c, x)` where `c` is a public channel. This allows the attacker to obtain any value of type `t` sent on channel `cread`, and can be done for several types if desired. As above, when types are ignored, it in fact allows the attacker to obtain any value sent on channel `cread`.

#### Memory cell

One can encode a memory cell in which one can read and write. We declare three private channels: one for the cell itself, one for reading and one for writing in the cell.

```
free cell , cread , cwrite : channel [private ].
```

and include the following process

```proverif
out(cell , init) |
 (! in( cell , x:t); in(cwrite , y:t); out( cell , y)) |
 (! in( cell , x:t); out(cread , x); out( cell , x))
```

where `t` is the type of the content of the cell, and `init` is its initial value. The current value of the cell is the one available as an output on channel `cell`. We can then write in the cell by outputting on channel `cwrite` and read from the cell by reading on channel `cread`.

We can give the attacker the capability to read and/or write the cell by defining `cread` as a channel on which the attacker can read and/or `cwrite` as a channel on which the attacker can write, using the asymmetric channels presented above.

It is important for the soundness of this encoding that one never reads on `cwrite` or writes on `cread`, except in the code of the cell itself.

Due to the abstractions performed by ProVerif, such a cell is treated in an approximate way: all values written in the cell are considered as a set, and when one reads the cell, ProVerif just guarantees that the obtained value is one of the written values (not necessarily the last one, and not necessarily one written before the read).

#### Interface for creating principals

Instead of creating two protocol participants `A` and `B`, it is also possible to define an interface so that the attacker can create as many protocol participants as he wants with the parameters of its choice, by sending appropriate messages on some channels.

In some sense, the interface provided in the model of Section 5.3 constitutes a limited example of this technique: the attacker can start an initiator that has identity `h_I` and that talks to responder `h_R` by sending the message `(h_I,h_R)` to the first input of `processInitiator` and it can start a responder that has identity `h_R` by sending that identity to the first input of `processResponder`.

A more complex interface can be defined for more complex protocols. Such an interface has been defined for the JFK protocol, for instance. We refer the reader to [ABF07] (in particular Appendix B.3) and to the files in `examples/pitype/jfk` (if you installed by OPAM in the switch ⟨switch⟩, in `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/jfk`) for more information.

### 6.7.5 Sources of incompleteness

In order to prove protocols, ProVerif translates them internally into Horn clauses. This translation performs safe abstractions that sometimes result in false counterexamples. We detail the main abstractions in this section. We stress that these abstractions preserve soundness: if ProVerif claims that a property is true or false, then this claim is correct. The abstractions only have as a consequence that ProVerif sometimes says that a property "cannot be proved", which is a "don't know" answer.

#### Repetition of actions

The Horn clauses can be applied any number of times, so the translation ignores the number of repetitions of actions. For instance, ProVerif finds a false attack in the following process, already mentioned in Section 6.2:

```proverif
new k:key; out(c, senc(senc(s,k),k));
in(c, x: bitstring ); out(c, sdec(x,k))
```

It thinks that one can decrypt `senc(senc(s,k),k)` by sending it to the input, so that the process replies with `senc(s,k)`, and then sending this message again to the input, so that the process replies with `s`. However, this is impossible in reality because the input can be executed only once. The previous process has the same translation into Horn clauses as the process

```proverif
new k:key; out(c, senc(senc(s,k),k));
! in(c , x: bitstring ); out(c , sdec(x,k))
```

with an additional replication, and the latter process is subject to the attack outlined above.

This approximation is the main approximation made by ProVerif. In fact, for secrecy (and probably also for basic non-injective correspondences), when all channels are public and the fresh names are generated by `new` as late as possible, this is the only approximation [Bla05]. The option `[precise]`, introduced in Section 6.2, allows the user to eliminate many false attacks coming from this approximation.

#### Position of new

The position of `new` in the process influences the internal representation of fresh names in ProVerif: fresh names created by `new` are represented as functions of the inputs located above that `new`. So the more the `new` are moved downwards in the process, the more arguments they have, and in general the more precise and the more costly the analysis is. (See also Section 6.7.2 for additional discussion of this point.)

#### Private channels

Private channels are a powerful tool for encoding many features in the pi calculus. However, because of their power and complexity, they also lead to additional approximations in ProVerif. In particular, when `c` is a private channel, the process `P` that follows `out(c, M); P` can be executed only when some input listens on channel `c`; ProVerif does not take that into account and considers that `P` can always be executed.

Moreover, ProVerif just computes a set of messages sent on a private channel, and considers that any input on that private channel can receive any of these messages (independently of the order in which they are sent). This point can be considered as a particular case of the general approximation that repetitions of actions are ignored: if a message has been sent on a private channel at some point, it may be sent again later. Ignoring the number of repetitions of actions then tends to become more important in the presence of private channels than with public channels only.

Let us consider for instance the process

```proverif
new c:channel; (out(c,M) | in(c,x:t); in(c,y:t); P)
```

The process `P` cannot be executed, because a single message is sent on channel `c`, but two inputs must be performed on that channel before being able to execute `P`. ProVerif cannot take that into account because it ignores the number of repetitions of actions: the process above has the same translation into Horn clauses as the variant with replication

```proverif
new c:channel; ((!out(c,M)) | in(c,x:t); in(c,y:t); P)
```

which can execute `P`.

Similarly, the process

```proverif
new c:channel; (out(c,s) | in(c,x:t); out(d,c))
```

preserves the secrecy of `s` because the attacker gets the channel `c` too late to be able to obtain `s`. However, ProVerif cannot prove this property because the translation treats it like the following variant

```proverif
new c:channel; ((!out(c,s)) | in(c,x:t); out(d,c))
```

with an additional replication, which does not preserve the secrecy of `s`.

#### Observational equivalence

In addition to the previous approximations, ProVerif makes further approximations in order to prove observational equivalence. In order to show that `P` and `Q` are observationally equivalent, it proves that, at each step, `P` and `Q` reduce in the same way: the same branch of a test or destructor application is taken, communications happen in both processes or in neither of them. This property is sufficient for proving observational equivalence, but it is not necessary. For instance, in a test

```
if M = N then R₁ else R₂
```

if the `then` branch is taken in `P` and the `else` branch is taken in `Q`, then ProVerif cannot prove observational equivalence. However, `P` and `Q` may still be observationally equivalent if the attacker cannot distinguish what `R₁` does from what `R₂` does.

Along similar lines, the biprocess

```
P = out(c,choice[m,n]) | out(c,choice[n,m])
```

satisfies observational equivalence but ProVerif cannot show this: the first component of the parallel composition outputs either `m` or `n`, and the attacker has these two names, so ProVerif cannot prove observational equivalence because it thinks that the attacker can distinguish these two situations. In fact, the difference in the first output is compensated by the second output, so that observational equivalence holds. In this simple example, it is easy to prove observational equivalence by rewriting the process into the structurally equivalent process `out(c,choice[m,m]) | out(c,choice[n,n])` for which ProVerif can obviously prove observational equivalence. It becomes more difficult when a configuration similar to the one above happens in the middle of the execution of the process. Ben Smyth et al. are working on an extension of ProVerif to tackle such cases [DRS08].

#### Limitations of attack reconstruction

Some limitations also come from attack reconstruction. The reconstruction of attacks against injective correspondences is based on heuristics that sometimes fail. For observational equivalences, ProVerif can reconstruct a trace that reaches the first point at which the two processes start reducing differently. However, such a trace does not guarantee that observational equivalence is wrong; for this reason, ProVerif never says that an observational equivalence is false.

### 6.7.6 Misleading syntactic constructs

- In the following ProVerif code

  ```
  if ... then
      let x = ... in
      ...
  else
      ...
  ```

  the `else` branch refers to `let` construct, not to the `if`. The constructs `if`, `let`, and `get` can all have `else` branches, and `else` always refers to the latest one. This is true even if the `else` branch of `let` can never be executed because the `let` always succeeds. Hence, the code above is correctly indented as follows:

  ```
  if ... then
  let x = ... in
      ...
  else
      ...
  ```

  and if the `else` branch refers to the `if`, parentheses must be used:

  ```
  if ... then
  (
      let x = ... in
      ...
  )
  else
      ...
  ```

- When `tc` is a `typeConverter` function and types are ignored, the construct

  ```
  let tc(x) = M in ... else ...
  ```

  is equivalent to

  ```
  let x = M in ... else ...
  ```

  Hence, its `else` branch will be executed only if the evaluation of `M` fails. When `M` never fails, this is clearly not what was intended.

- In patterns, identifiers without argument are always variables bound by the pattern. For instance, consider

  ```proverif
  const c: bitstring .
  let (c, x) = M in ...
  ```

  Even if `c` is defined before, `c` is redefined by the pattern-matching, and the pattern `(c, x)` matches any pair. ProVerif displays a warning saying that `c` is rebound. If you want to refer to the constant `c` in the pattern, please write:

  ```proverif
  const c: bitstring .
  let (=c, x) = M in ...
  ```

  The pattern `(=c, x)` matches pairs whose first component is equal to `c`. If you want to refer to a data function without argument, the following syntax is also possible:

  ```proverif
  const c: bitstring [data].
  let (c() , x) = M in ...
  ```

- The construct `if M then P else Q` does not catch failure inside the term `M`, that is, it executes nothing when the evaluation of `M` fails. Its `else` branch is executed only when the evaluation of `M` succeeds and its result is different from `true`. In contrast, the construct `let T = M in P else Q` catches failure inside `T` and `M`. That is, its `else` branch is executed when the evaluation of `T` or `M` fails, or when these evaluations succeed and the result of `M` does not match `T`.

## 6.8 Compatibility with CryptoVerif

For a large subset of the ProVerif and CryptoVerif languages, you can run the same input file both in ProVerif and in CryptoVerif. (CryptoVerif is a computationally-sound protocol verifier that can be downloaded from http://cryptoverif.inria.fr.) ProVerif proves protocols in the formal model and can reconstruct attacks, while CryptoVerif proves protocols in the computational model. CryptoVerif proofs are more satisfactory, because they rely on a less abstract model, but CryptoVerif is more difficult to use and less widely applicable than ProVerif, and it cannot reconstruct attacks, so these two tools are complementary.

ProVerif includes the following extensions to allow that. ProVerif allows to use macros for defining the security assumptions on primitives. One can define a macro `name(i₁,...,iₙ)` by

```
def name(i₁ ,...,iₙ ) {
    declarations
}
```

Then `expand name(a₁,...,aₙ).` expands to the declarations inside `def` with `a₁,...aₙ` substituted for `i₁,...,iₙ`. As an example, we can define block ciphers by

```
def SPRP_cipher(keyseed , key, blocksize , kgen, enc , dec , Penc) {
fun enc(blocksize , key): blocksize .
fun kgen(keyseed):key.
fun dec(blocksize , key): blocksize .
equation forall m: blocksize , r:keyseed;
   dec(enc(m, kgen(r)) , kgen(r)) = m.
equation forall m: blocksize , r:keyseed;
   enc(dec(m, kgen(r)) , kgen(r)) = m.
}
```

`SPRP` stands for Super Pseudo-Random Permutation, a standard computational assumption on block ciphers; here, the ProVerif model tries to be close to this assumption, even if it is probably stronger. `Penc` is the probability of breaking this assumption; it makes sense only for CryptoVerif, but the goal to use the same macros with different definitions in ProVerif and in CryptoVerif.

We can then declare a block cipher by

```
expand SPRP_cipher(keyseed , key, blocksize , kgen, enc , dec , Penc).
```

without repeating the whole definition.

The definitions of macros are typically stored in a library. Such a library can be specified by the command-line option `-lib`. The file `cryptoverif.pvl` (at the root of the ProVerif distribution or, if you installed by OPAM in the switch ⟨switch⟩, in `~/.opam/⟨switch⟩/share/proverif/cryptoverif.pvl`) is an example of such a library. It can be included by calling

```
proverif -lib cryptoverif ⟨filename⟩.pv
```

The definitions of cryptographic primitives need to be included in such a library, because they are typically very different between ProVerif and CryptoVerif. We can then use a different library for each tool.

ProVerif also supports but ignores the CryptoVerif declarations `letproba`, `param`, `proba`, `proof`, `implementation`, as well as the implementation annotations. It supports options after a type declaration, as in `type t [option]`. These options are ignored. It supports `channel c₁,...,cₙ.` as a synonym of `free c₁,...,cₙ: channel.` (Only the former is supported by CryptoVerif.) It supports `yield` as a synonym of `0`. It allows `! i <= n` instead of just `!`. (CryptoVerif uses the former.) It also allows the following constructs:

| New syntax | Original equivalent syntax |
|---|---|
| `foreach i <= N do P` | `! i <= n P` |
| `x <-R T; P` | `new x:T; P` |
| `x[:T] <- M; P` | `let x[:T] = M in P` |
| `x <-R T; N` | `new x:T; N` |
| `x[:T] <- M; N` | `let x[:T] = M in N` |

ProVerif accepts

```
equation [ forall x₁ :T₁,...,xₙ : Tₙ ;] M.
```

as a synonym for

```
equation [ forall x₁ :T₁,...,xₙ : Tₙ ;] M = true .
```

ProVerif also allows disequations

```
equation [ forall x₁ :T₁,...,xₙ : Tₙ ;] M₁ <> M₂ .
```

It just checks that they are valid (the terms `M₁` and `M₂` do not unify modulo the equational theory) and otherwise ignores them. Examples of protocols written with CryptoVerif compatibility in mind can be found in subdirectory `examples/cryptoverif/`. You can run them by

```
./proverif -lib cryptoverif examples/cryptoverif/⟨filename⟩.pcv
```

from the main directory of the ProVerif distribution. If you installed ProVerif by OPAM in the switch ⟨switch⟩, these files are in `~/.opam/⟨switch⟩/doc/proverif/examples/cryptoverif` and you can run them by

```
proverif -lib ~/.opam/⟨switch⟩/share/proverif/cryptoverif ⟨filename⟩.pcv
```

from the directory `~/.opam/⟨switch⟩/doc/proverif/examples/cryptoverif/`.

There are still features supported only by one of the two tools. CryptoVerif does not support the definition of free names. You can define free public channels by `channel c₁,...,cₙ`, and you can define public constants by `const c:T`. CryptoVerif does not support private constants or functions. All constants and functions are public. CryptoVerif does not support private channels (`free c: channel [private].` and channels bound by `new`). All channels must be public and free. It is recommended to use a distinct channel for each input and output in CryptoVerif, because when there are several possible input on the same channel, the one that receives the message is chosen at random. CryptoVerif does not support phases (`phase`) nor synchronization (`sync`).

CryptoVerif does not support destructors. It supports equations, though they have a different meaning: in ProVerif, you need to give all equations that hold, all other terms are considered as different; in CryptoVerif, you give some equations that hold, there may be other true equalities. CryptoVerif does not support `fail`. All terms always succeed in CryptoVerif. Conversely, ProVerif does not support `equation builtin`: it does not support associativity; you can define commutativity by giving the explicit equation. ProVerif does not support defining primitives with indistinguishability axioms as it is done in CryptoVerif and it does not support collision statements. You can use different definitions of primitives in ProVerif and CryptoVerif by using a different library or using `ifdef`. You should still make sure that all functions always succeed, possibly returning a special value instead of failing.

CryptoVerif supports the correspondence, secrecy, and equivalence queries. However, it does not support queries using the predicates `attacker`, `mess`, or `table`. CryptoVerif does not support nested correspondences, nor `noninterf`, `weaksecret`, `choice`. CryptoVerif does not support predicates and `let ... suchthat`. It does not support referring to bound names in queries. It does not support `putbegin`, secrecy assumptions (`not F.`), `select`, `noselect`, `nounif`, `axiom`, nor `lemma`. You can put queries and proof indications specific to ProVerif inside `ifdef`s.

The processes in CryptoVerif must alternate inputs and outputs: an input must be followed by computations and an output; an output must be followed by replications, parallel compositions, and inputs. The main process must start with an input, a replication or a parallel composition. This constraint allows the adversary to schedule the execution of the processes by sending a message to the appropriate input. You can always add inputs or outputs of empty messages to satisfy this constraint.

ProVerif does not support the `find` construct of CryptoVerif. `find` can be encoded using tables with `insert` and `get` instead.

The emacs mode included in the CryptoVerif distribution includes a mode for `.pcv` files, which is designed for compatibility with both tools. Common keywords and builtin identifiers are displayed normally, while keywords and builtin identifiers supported by only one of the two tools are highlighted in red. The recommended usage is to use

```
ifdef(‘ProVerif’,‘ProVerif specific code’)
ifdef(‘CryptoVerif’,‘CryptoVerif specific code’)
```

inside your `.pcv` files. When ProVerif is called with a `.pcv` file as argument, it automatically preprocesses it with `m4`, as if you ran

```
m4 -DProVerif ⟨filename⟩.pcv > ⟨filename⟩.pv
```

before analyzing it. Similarly, when CryptoVerif is called with a `.pcv` file as argument, it automatically preprocesses it with `m4`, as if you ran

```
m4 -DCryptoVerif ⟨filename⟩.pcv > ⟨filename⟩.cv
```

## 6.9 Additional programs

### 6.9.1 test

Usage:

```
test [-timeout ⟨n⟩] ⟨mode⟩ ⟨test set⟩
```

where `-timeout ⟨n⟩` sets the timeout for each execution of the tested program to `n` seconds (by default, there is no timeout), ⟨mode⟩ can be:

- `test`: test the mentioned scripts
- `test add`: test the mentioned scripts and add the expected result in the script when it is missing
- `add`: add the expected result in the script when it is missing, do not test scripts that already have an expected result
- `update`: test the mentioned scripts and update the expected result in the script

and ⟨test set⟩ can be:

- `typed` runs ProVerif on examples for the typed front-ends
- `typedopt` runs ProVerif on examples for the typed front-ends, with various additional options
- `untyped` runs ProVerif on examples for the untyped front-ends
- `arinc` runs ProVerif on the ARINC823 protocol
- `dir ⟨prefix⟩ ⟨list of directories⟩` analyzes the mentioned directories using ProVerif, using ⟨prefix⟩ as prefix for the output files.

⟨test set⟩ can be omitted when it is `typed`, and ⟨mode⟩ ⟨test set⟩ can both be omitted when they are `test typed`.

The script `test` is a bash shell script, so you must have `bash` installed. On Windows, the best is to install Cygwin and run `test` from a Cygwin terminal.

The script `test` must be run in the ProVerif main directory; the programs `analyze` and `proverif` must be present in that directory.

The script `test` first runs the script `prepare` in each directory when it is present. That allows for instance to generate the ProVerif scripts to run. Then it runs the program `analyze` described below.

### 6.9.2 analyze

The program `analyze` is mainly meant to be called from `test`, but it can also be called directly.

Usage:

```
analyze [⟨options⟩] ⟨prog⟩ ⟨mode⟩ ⟨tmp directory⟩ ⟨prefix for output files⟩ dirs ⟨directories⟩
analyze [⟨options⟩] ⟨prog⟩ ⟨mode⟩ ⟨tmp directory⟩ ⟨prefix for output files⟩ file ⟨directory⟩ ⟨filename⟩
```

where ⟨options⟩ can be

- `-timeout ⟨n⟩` sets the timeout for each execution of the tested program to `n` seconds (by default, there is no timeout);
- `-progopt ⟨command -line options⟩ -endprogopt` passes the additional ⟨command -line options⟩ to the tested program (ProVerif or CryptoVerif);

⟨prog⟩ is either `CV` for CryptoVerif or `PV` for ProVerif and ⟨mode⟩ is as for the `test` program above. Temporary files are stored in directory ⟨tmp directory⟩, and the output files are:

- full output of the test: `tests/⟨prefix for output files⟩⟨date⟩`,
- summary of the results: `tests/sum-⟨prefix for output files⟩⟨date⟩`,
- comparison with expected results: `tests/res-⟨prefix for output files⟩⟨date⟩`.

This program analyzes a series of scripts using the program specified by ⟨prog⟩.

- In the first command line, it analyzes scripts in the mentioned directories and in their subdirectories. The files whose name contains `.m4.` or `.out.` are excluded. (The first ones are supposed to be files to preprocess by `m4` before actually analyzing them; the second ones are supposed to be output files.) When the program is CryptoVerif, the files whose name ends with `.cv`, `.ocv`, or `.pcv` are analyzed. When the program is ProVerif, the files whose name ends with `.pcv`, `.pv`, `.pi`, `.horn`, or `.horntype` are analyzed.
- In the second command line, the specified file in the specified directory is analyzed, provided it has one of the extensions above. (The directory and the file are mentioned separately because the directory may be used to locate the library `mylib.*`, see below.)

The executable for CryptoVerif is searched in the current directory, in `$HOME/CryptoVerif`, and in the `PATH`. The executable for ProVerif is searched in the current directory, in `$HOME/proverif/proverif`, and in the `PATH`.

When `mylib.cvl` is present in a directory, its files with extension `.cv` or `.pcv` are analyzed using that library of primitives for CryptoVerif. Otherwise, the default library is used.

When `mylib.ocvl` is present in a directory, its files with extension `.ocv` are analyzed using that library of primitives for CryptoVerif. Otherwise, the default library is used.

When `mylib.pvl` is present in a directory, its files with extension `.pcv` or `.pv` are analyzed using that library of primitives for ProVerif. Otherwise, the library `cryptoverif.pvl` is used for `.pcv` files and no library for `.pv` files. The file `cryptoverif.pvl` is searched in the current directory, `$HOME/CryptoVerif` and `$HOME/proverif/proverif`. If it is not found and `mylib.pvl` is not present in the directory, `.pcv` files are not analyzed using ProVerif.

The result of running each script is compared to the expected result. The expected result is found in the script itself in a comment that starts with `EXPECTED` for CryptoVerif and `EXPECTPV` for ProVerif, and ends with `END`. (The entire lines that contain `EXPECTED`, resp. `EXPECTPV` and `END` do not belong to the expected result.) For CryptoVerif, the expected result consists of the line `RESULT Could not prove ...` or `All queries proved` in the output of CryptoVerif. For ProVerif, it consists of the lines that start with `RESULT` in the output of ProVerif. It also includes a runtime of the script or an error message `xtime: ...` if the execution terminates with an error.

In the modes `update` (resp. `test add` or `add`), the expected result is updated (resp. added if it is absent or empty). To deal with generated files, the `EXPECTED`, resp. `EXPECTPV` line may contain the indications

```
FILENAME: name of the file TAG: distinct tag
```

In this case, the expected result is not updated in the script itself, but in the file whose name is mentioned after `FILENAME:`, and inside this file after an exact copy of the line that contains `EXPECTED`, resp. `EXPECTPV`. (This line is unique thanks to the tag.) The idea is that this file is the file from which the script was generated. Hence regenerating the script from this file with an updated expected result will update the expected result in the script.

### 6.9.3 addexpectedtags

Usage:

```
addexpectedtags ⟨directories⟩
```

For each mentioned directory, for each file in that directory or its subdirectories that contains `.m4.` in its name and ends with `.cv`, `.ocv`, `.pcv`, `.pv`, `.pi`, `.horntype`, `.horn`, this program adds at the end of each line that contains `EXPECTED` or `EXPECTPV` the indications

```
FILENAME: name of the file TAG: distinct integer
```

These files are supposed to be initial models used to generate CryptoVerif or ProVerif scripts by the `m4` preprocessor. The additional indications will propagate to the generated scripts, and will allow the `analyze` program above to find from which `m4` file the script was generated (indicated after `FILENAME:`) and inside this `m4` file, which expected result indication ended up in the considered script (identified by the integer after `TAG:`). It can then update the expected results in the mode `update`, `add`, or `test add` (the last two when the expected result was initially empty).
