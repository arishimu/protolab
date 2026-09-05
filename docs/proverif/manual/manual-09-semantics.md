# Appendix B: Semantics

In this appendix, we provide the semantics for the input language of ProVerif. A simpler semantics for the core language of ProVerif can be found in research papers, for instance [Bla16].

We consider an infinite set of names N. We denote by Npub all names declared with the channel and free (without option private) declarations from Figure A.2. We denote by Fc the set containing the constructor function symbols declared with the fun declaration without reduc from Figure A.2 as well as built-in constructors: true, false, 0, +1, tuples. Similarly, we denote by Fd the set containing destructor function symbols declared by the reduc declaration or the fun declaration with reduc as well as built-in destructors: not, is nat, ||, &&, =, <>, <=, >=, <, >, -k for each k natural number. (More built-in constructors and destructors are used by ProVerif for some encodings; we omit them here.)

We denote by M, N, ... a ⟨term⟩ that does not contain destructor function symbols. The equational theory is denoted E and is the set of all equations defined with the equation declaration from Figure A.2. We will denote by M =E N when M and N are equal modulo the equational theory E.

Note that in Figure A.1, ⟨term⟩ includes the syntax for natural numbers. Internally, they are represented by a constant 0 and a unary constructor function symbol +1 such that a natural number n is in fact n successive applications of +1 to 0. For example, 2 is the term +1(+1(0)). The term M + k and k + M are therefore syntactic sugar for k applications of +1 to the term M. A similar comment applies to process terms ⟨pterm⟩ and patterns ⟨pattern⟩.

**Rewrite rules.** We denote by U, V, ... a ⟨mayfailterm⟩ that does not contain destructor function symbols. A conditional rewrite rule is a classic rewrite rule h(U1,...,Un) → U to which a conditional formula ϕ is added, denoted h(U1,...,Un) → U || ϕ. Note that the formula is always of the form

```
  n                  n′                  n′′                    n′′′
  ∧  Mi ≥ Ni   ∧   ∧  ¬nat(M′i′)   ∧   ∧  nat(M′′i′′)   ∧   ∧  ∀x̃. M′′′i ≠ N′′′i
  i=1                i′=1                i′′=1                  i′′′=1
```

where x̃ stands for a sequence of variables and nat is the predicate returning true iff its argument is a natural number. From the rewrite rules ⟨reduc⟩ and ⟨reduc′⟩ in the declaration of a destructor from Figure A.2, ProVerif generates a set of equivalent conditional rewrite rules.

For example, assume that enc/2 ∈ Fc and consider the destructor dec declared by

```proverif
reduc forall x:bitstring, y:bitstring; dec(enc(x,y),y) = x.
```

ProVerif generates the following set of conditional rewrite rules:

```
dec(enc(x,y),y) → x
dec(x,y) → fail || ∀z.x ≠ enc(z,y)
dec(fail,u) → fail
dec(x,fail) → fail
```

where x, y are variables and u is a may-fail variable.

The infix symbols &&, ||, =, ... defined in ⟨infix⟩ are in fact represented internally by destructor function symbols. For instance,

```
&&(true,u) → u
&&(x,u) → false || x ≠ true
&&(fail,u) → fail
```

where x is a variable and u is a may-fail variable.

Similarly, the infix operators on natural numbers >=, >, ... are also represented by destructor function symbols:

```
>=(x,y) → true || x ≥ y
>=(x,y) → false || y ≥ x+1
>=(x,y) → fail || ¬nat(x)
>=(x,y) → fail || ¬nat(y)
>=(fail,u) → fail
>=(x,fail) → fail
```

The symbols not and is nat are also destructor function symbols. is nat(M) is true iff M is the term for some natural number and false otherwise. is nat(fail) is fail.

The term M −k is the application of the destructor -k to M, which one might write -k(M). -k(M) returns N when M consists of k applications of +1 to the term N. Otherwise, -k(M) returns fail.

For each destructor h ∈ Fd, we denote by def(h) the associated set {h(Ui,1,...,Ui,n) → Ui || ϕi}mi=1 of rewrite rules.

**Predicates.** We denote by Fp the set of predicates defined by the pred declaration. For all p/n ∈ Fp, we denote by def(p) the set (possibly infinite) of tuples (M1,...,Mn) such that p(M1,...,Mn) is true. When the predicate p is defined with the option [block], def(p) is not given to ProVerif and so ProVerif will try to prove the query for all possible def(p). Otherwise def(p) is defined as the set of tuples (M1,...,Mn) such that p(M1,...,Mn) is derivable by the clauses ⟨clauses⟩ defined with the clauses declaration from Figure A.2.

## B.1 Semantics of process terms and patterns

A process term corresponds to an element ⟨pterm⟩ from Figure A.1. To describe the semantics of process terms, we extend the definition of ⟨pterm⟩ to allow the fail constant, i.e.

```
⟨pterm⟩ ::= ... | fail
```

Note that in Figure A.1, some constructs of ⟨pterm⟩ are optional, i.e. else ⟨pterm⟩ and suchthat ⟨pterm⟩. When omitted, they are respectively syntactic sugar for else fail and suchthat true.

In what follows, we will denote by D a process term. Some process terms are in fact syntactic sugar for others:

- k <-R t; D is syntactic sugar for new k:t; D
- x[: t] <- D; D′ is syntactic sugar for let x[: t] = D in D′ else 0

We will also denote by M, N, ... a process term that can be cast as a ⟨term⟩ that does not contain destructor function symbols; and by U, V, ... a process term that can be cast as a ⟨mayfailterm⟩ that does not contain destructor function symbols.

A pattern pat corresponds to an element ⟨pattern⟩ from Figure A.1. We will denote by cpat a pattern such that for all occurrences of =D in cpat, D is a may-fail constructor term U. We say that the pattern is simple in such a case.

The semantics of simple pattern-matching can be formally defined using a function matches such that matches(cpat,U) returns a substitution σ that gives the value of the variables bound by the pattern, when pattern-matching succeeds. This function is defined as follows:

```
matches(x, M) = {M/x}

matches(=M, N) = ∅      if M =E N

matches(f(cpat1,...,cpatn), f(M1,...,Mn)) = ⋃i∈{1,...,n} σi
   if matches(cpati, Mi) = σi for all i ∈ {1,...,n}
```

Note that if cpat contains an occurrence of = fail or if U = fail then matches(cpat,U) is not defined.

The semantics of process terms and pattern-matching are respectively given by two labeled transition relations →ℓt and →ℓp on term and pattern configurations where ℓ can either be empty or an event ev(M1,...,Mn) with ev being one of the events declared with the event declaration from Figure A.2. A term configuration and pattern configuration are respectively the tuples ⟨T, Npr, D⟩ and ⟨T, Npr, pat⟩ where:

- T is the state of tables, that is a set of elements of the form tbl(M1,...,Mn) where tbl is one of the tables declared with the table declaration from Figure A.2.
- Npr is the set of private names.

We define the relations →ℓt and →ℓp in Figure B.1, where Ct is the set containing the following contexts of process terms:

- if □ then D else D′
- let pat = □ in D else D′
- let x1,...,xm suchthat p(U1,...,Ui−1, □, Ui+1,...,Un) in D else D′
- g(U1,...,Ui−1, □, Ui+1,...,Un) with g ∈ Fc ∪ Fd
- event ev(U1,...,Ui−1, □, Ui+1,...,Un);D
- insert tbl(U1,...,Ui−1, □, Ui+1,...,Un);D

and Cpat is the set containing the following contexts of process terms:

- let □ = U in D else D′
- get tbl(cpat1,...,cpati−1, □, pati+1,...,patn) suchthat D in D1 else D2

The conditions D of get never contain new, <-R, let ... suchthat, event, insert, so in the rules for get, T and Npr are indeed unchanged during the evaluation of D.

**Figure B.1 — Semantics of process terms and patterns.**

```
T, Npr, f(cpat1,...,cpati−1, pati, pati+1,...,patn) →ℓp T′, N′pr, f(cpat1,...,cpati−1, pat′i, pati+1,...,patn)
   if T, Npr, pati →ℓp T′, N′pr, pat′i

T, Npr, =D →ℓp T′, N′pr, =D′
   if T, Npr, D →ℓt T′, N′pr, D′

T, Npr, f(M1,...,Mi−1, fail, Ui+1,...,Un) →t T, Npr, fail
   if f ∈ Fc

T, Npr, h(U1,...,Un) →t T, Npr, U′σ
   if h ∈ Fd, and there exists a rewrite rule h(U′1,...,U′n) → U′ || ϕ in def(h)
      such that U′1σ =E U1, ..., U′nσ =E Un, and ϕσ is true

T, Npr, new a;D →t T, Npr ∪ {a}, D{a′/a}
   where a ∈ N \ (Npub ∪ Npr)

T, Npr, if M then D else D′ →t T, Npr, D
   if M =E true

T, Npr, if M then D else D′ →t T, Npr, D′
   if M ≠E true

T, Npr, if fail then D else D′ →t T, Npr, fail

T, Npr, let cpat = U in D else D′ →t T, Npr, Dσ
   if matches(cpat,U) = σ

T, Npr, let cpat = U in D else D′ →t T, Npr, D′
   if matches(cpat,U) is not defined

T, Npr, let x1,...,xm suchthat p(M1,...,Mn) in D else D′ →t T, Npr, Dσ
   if (M1,...,Mn)σ ∈ def(p) and for all i, xiσ is a ground constructor term

T, Npr, let x1,...,xm suchthat p(M1,...,Mn) in D else D′ →t T, Npr, D′
   if (M1,...,Mn)σ ∉ def(p) for all σ such that for all i, xiσ is a constructor term

T, Npr, let x1,...,xm suchthat p(M1,...,Mi−1, fail, Ui+1,...,Un) in D else D′ →t T, Npr, fail

T, Npr, event ev(M1,...,Mn);D →ev(M1,...,Mn)t T, Npr, D

T, Npr, event ev(M1,...,Mi−1, fail, Ui+1,...,Un);D →t T, Npr, fail

T, Npr, insert tbl(M1,...,Mn);D →t T ∪ {tbl(M1,...,Mn)}, Npr, D

T, Npr, insert tbl(M1,...,Mi−1, fail, Ui+1,...,Un);D →t T, Npr, fail

T, Npr, get tbl(cpat1,...,cpatn) suchthat D in D1 else D2 →t T, Npr, D1σ
   if there exists tbl(M1,...,Mn) ∈ T such that
      matches((cpat1,...,cpatn),(M1,...,Mn)) = σ and
      T, Npr, Dσ →∗t T′, N′pr, M with M =E true

T, Npr, get tbl(cpat1,...,cpatn) suchthat D in D1 else D2 →t T, Npr, D2
   if for all tbl(M1,...,Mn) ∈ T,
      matches((cpat1,...,cpatn),(M1,...,Mn)) = σ and
      T, Npr, Dσ →∗t T′, N′pr, M implies M ≠E true

T, Npr, C[D] →ℓt T′, N′pr, C[D′]
   if T, Npr, D →ℓt T′, N′pr, D′ and C[□] ∈ Ct

T, Npr, C[pat] →ℓt T′, N′pr, C[pat′]
   if T, Npr, pat →ℓp T′, N′pr, pat′ and C[□] ∈ Cpat
```

## B.2 Semantics of processes

A process corresponds to an element of ⟨process⟩ from Figure A.8. Some processes are in fact syntactic sugar for others:

- yield is syntactic sugar for 0
- !i <= j P and foreach i <= j do P are syntactic sugar for ! P
- k <-R t; P is syntactic sugar for new k:t; P
- x[: t] <- D; P is syntactic sugar for let x[: t] = D in P else 0

Similarly to process terms, when else ⟨process⟩, in ⟨process⟩ else ⟨process⟩, ; ⟨process⟩, and suchthat ⟨pterm⟩ are omitted, they are respectively syntactic sugar for else 0, in 0 else 0, ; 0, and suchthat true.

Given a process P, we define synchro(P) the set collecting all synchronization parameters that occur in P. Hence, synchro(sync n [tag];Q) = {(n,tag)} ∪ synchro(Q) and in all other cases, synchro(P) is the union of the synchronization parameters of the immediate subprocesses of P. When the tag [tag] of a synchronization is omitted, ProVerif uses a new fresh tag.

A process configuration is a tuple ⟨S, ph, T, Npr, P⟩ where S is a set of pairs (integer,tag) representing the synchronization parameters, ph is an integer representing the phase, and P is a multiset of processes. The initial configuration for a closed process P is ⟨synchro(P), 0, ∅, N′pr, {P}⟩ where N′pr is the set of names declared with the free declaration from Figure A.2 with the option [private]. The semantics of processes is given by a labeled transition relation →ℓ between process configurations where ℓ can either be empty or an event ev(M1,...,Mn) with ev being one of the events declared with the event declaration from Figure A.2.

This labeled transition relation is defined in Figure B.2, where Ct is the set containing the following contexts of process terms:

- out(□,D);P
- out(U,□);P
- in(□,pat);P
- if □ then P else Q
- let pat = □ in P else Q
- let x1,...,xm suchthat p(U1,...,Ui−1, □, Ui+1,...,Un) in P else Q
- event ev(U1,...,Ui−1, □, Ui+1,...,Un);P
- insert tbl(U1,...,Ui−1, □, Ui+1,...,Un);P

and Cpat is the set containing the following contexts of process terms:

- let □ = U in P else Q
- get tbl(cpat1,...,cpati−1, □, pati+1,...,patn) suchthat D in P else Q

**Figure B.2 — Semantics of processes.**

```
S, ph, T, Npr, P ∪ {0} → S, ph, T, Npr, P

S, ph, T, Npr, P ∪ {P | Q} → S, ph, T, Npr, P ∪ {P, Q}

S, ph, T, Npr, P ∪ {!P} → S, ph, T, Npr, P ∪ {!P, P}

S, ph, T, Npr, P ∪ {new a;P} → S, ph, T, Npr ∪ {a}, P ∪ {P{a′/a}}
   where a ∈ N \ (Npub ∪ Npr)

S, ph, T, Npr, P ∪ {out(N,M);Q, in(N′,pat);P} → S, ph, T, Npr, P ∪ {Q, let pat = M in P}
   if N =E N′

S, ph, T, Npr, P ∪ {if M then P else Q} → S, ph, T, Npr, P ∪ {P}
   if M =E true

S, ph, T, Npr, P ∪ {if M then P else Q} → S, ph, T, Npr, P ∪ {Q}
   if M ≠E true

S, ph, T, Npr, P ∪ {let cpat = U in P else Q} → S, ph, T, Npr, P ∪ {Pσ}
   if matches(cpat,U) = σ

S, ph, T, Npr, P ∪ {let cpat = U in P else Q} → S, ph, T, Npr, P ∪ {Q}
   if matches(cpat,U) is not defined

S, ph, T, Npr, P ∪ {let x1,...,xm suchthat p(M1,...,Mn) in P else Q} → S, ph, T, Npr, P ∪ {Pσ}
   if (M1,...,Mn)σ ∈ def(p) and for all i, xiσ is a ground constructor term

S, ph, T, Npr, P ∪ {let x1,...,xm suchthat p(M1,...,Mn) in P else Q} → S, ph, T, Npr, P ∪ {Q}
   if (M1,...,Mn)σ ∉ def(p) for all σ such that for all i, xiσ is a constructor term

S, ph, T, Npr, P ∪ {event ev(M1,...,Mn);P} →ev(M1,...,Mn) S, ph, T, Npr, P ∪ {P}

S, ph, T, Npr, P ∪ {insert tbl(M1,...,Mn);P} → S, ph, T ∪ {tbl(M1,...,Mn)}, Npr, P ∪ {P}

S, ph, T, Npr, P ∪ {get tbl(cpat1,...,cpatn) suchthat D in P else Q} → S, ph, T, Npr, P ∪ {Pσ}
   if there exists tbl(M1,...,Mn) ∈ T such that
      matches((cpat1,...,cpatn),(M1,...,Mn)) = σ and
      T, Npr, Dσ →∗t T′, N′pr, M with M =E true

S, ph, T, Npr, P ∪ {get tbl(cpat1,...,cpatn) suchthat D in P else Q} → S, ph, T, Npr, P ∪ {Q}
   if for all tbl(M1,...,Mn) ∈ T,
      matches((cpat1,...,cpatn),(M1,...,Mn)) = σ and
      T, Npr, Dσ →∗t T′, N′pr, M implies M ≠E true

S, ph, T, Npr, P ∪ P>ph+1 ∪ {phase (ph+1); Pi}ki=1 → S, ph+1, T, Npr, P>ph+1 ∪ {Pi}ki=1
   if all processes of P do not start with some phase ph′, ph′ > ph
      and all processes of Pph+1 start with some phase ph′, ph′ > ph+1

S, ph, T, Npr, P ∪ {sync n [tagi]; Pi}ki=1 → S \ {(n,tagi)}ki=1, ph, T, Npr, P ∪ {Pi}ki=1
   if k ≥ 1 and if (n′,tag′) ∈ S \ {(n,tagi)}ki=1 then n′ > n

S, ph, T, Npr, P ∪ {C[D]} →ℓ S, ph, T′, N′pr, P ∪ {C[D′]}
   if T, Npr, D →ℓt T′, N′pr, D′ and C[□] ∈ Ct

S, ph, T, Npr, P ∪ {C[pat]} →ℓ S, ph, T′, N′pr, P ∪ {C[pat′]}
   if T, Npr, pat →ℓp T′, N′pr, pat′ and C[□] ∈ Cpat
```

In the rules for get, the same comment holds as in the semantics of process terms. Synchronizations sync n [tag] with the same (n,tag) are allowed to occur only in different branches of if, let, let ... suchthat, get, and synchronizations never occur under replications, so the tags tagi are all distinct in the rule for sync.
