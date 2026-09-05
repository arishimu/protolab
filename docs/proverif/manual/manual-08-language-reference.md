# Appendix A: Language reference

In this appendix, we provide a reference for the typed pi calculus input language of ProVerif. We adopt
the following conventions. `X*` means any number of repetitions of X; and `[X]` means X or nothing.
`seq⟨X⟩` is a sequence of X, that is, `seq⟨X⟩ = [(⟨X⟩,)*⟨X⟩] = ⟨X⟩,...,⟨X⟩`. (The sequence can be
empty, it can be one element, or it can be several elements separated by commas.) `seq+⟨X⟩` is a non-
empty sequence of X: `seq+⟨X⟩ = (⟨X⟩,)*⟨X⟩ = ⟨X⟩,...,⟨X⟩`. (It can be one or several elements of ⟨X⟩
separated by commas.) Text in typewriter style should appear as it is in the input file. Text between ⟨
and ⟩ represents non-terminals of the grammar. In particular, we will use:

- `⟨ident⟩` to denote identifiers (Section 3.1.4) which range over an unlimited sequence of letters (a-z,
  A-Z), digits (0-9), underscores (`_`), single-quotes (`'`), and accented letters from the ISO Latin 1
  character set where the first character of the identifier is a letter and the identifier is distinct from
  the reserved words of the language.
- `⟨nat⟩` to range over natural numbers.
- `⟨int⟩` to range over integer numbers (`⟨nat⟩` or `−⟨nat⟩`).
- `⟨typeid⟩` to denote types (Section 3.1.1), which can be identifiers `⟨ident⟩` or the reserved word
  `channel`.
- `⟨options⟩ ::= [[seq+⟨ident⟩]]`, where the allowed identifiers in the sequence are `data`, `private`,
  and `typeConverter` for the `fun` and `const` declarations; `private` for the `reduc` and `free` dec-
  larations; `memberOptim` and `block` for the `pred` declaration; `precise` for processes (Figure A.8);
  `noneSat`, `discardSat`, `instantiateSat`, `fullSat`, `noneVerif`, `discardVerif`, `instantiateVerif`
  and `fullVerif` for the `query`, `lemma` and `axiom` declarations; `induction` and `noInduction` for the
  `lemma` and `query` declarations; `maxSubset` for the `lemma` declaration; `proveAll` for the `query` dec-
  laration; `reachability`, `pv reachability`, `real or random`, `pv real or random`, and all options
  starting with `cv` for the `secret` query.
- `⟨infix⟩ ::= || | && | = | <> | <= | >= | < | >` to denote some infix symbols on terms.

The input file consists of a list of declarations, followed by the keyword `process` and a process:

```
⟨decl⟩* process ⟨process⟩
```

or a list of declarations followed by an equivalence query between two processes (see end of Section 4.3.2):

```
⟨decl⟩* equivalence ⟨process⟩ ⟨process⟩
```

Libraries (loaded with the command-line option `-lib`) are lists of declarations `⟨decl⟩*`.

We start by presenting the grammar for terms in Figure A.1. The grammar for declarations is
considered in Figure A.2. Finally, Figure A.8 covers the grammar for processes.

**Figure A.1 — Grammar for terms (see Sections 3.1.4, 4.1.3, and 4.1.4)**

```
⟨term⟩ ::= ⟨ident⟩
       |  ⟨nat⟩
       |  (seq⟨term⟩)
       |  ⟨ident⟩(seq⟨term⟩)
       |  ⟨term⟩ (+ | -) ⟨nat⟩
       |  ⟨nat⟩ + ⟨term⟩
       |  ⟨term⟩ ⟨infix⟩ ⟨term⟩
       |  not (⟨term⟩)
⟨pterm⟩ ::= ⟨ident⟩
       |  (seq⟨pterm⟩)
       |  ⟨ident⟩(seq⟨pterm⟩)
       |  choice[⟨pterm⟩,⟨pterm⟩]                                  (see Section 4.3.2)
       |  ⟨pterm⟩ (+ | -) ⟨nat⟩
       |  ⟨nat⟩ + ⟨pterm⟩
       |  ⟨pterm⟩ ⟨infix⟩ ⟨pterm⟩
       |  not (⟨pterm⟩)
       |  new ⟨ident⟩[[seq⟨ident⟩]]: ⟨typeid⟩; ⟨pterm⟩
       |  ⟨ident⟩ <-R ⟨typeid⟩; ⟨pterm⟩                             (see Section 6.8)
       |  if ⟨pterm⟩ then ⟨pterm⟩ [else ⟨pterm⟩]
       |  let ⟨pattern⟩ = ⟨pterm⟩ in ⟨pterm⟩ [else ⟨pterm⟩]
       |  ⟨ident⟩[:⟨typeid⟩] <- ⟨pterm⟩;⟨pterm⟩                     (see Section 6.8)
       |  let ⟨typedecl⟩ suchthat ⟨pterm⟩ in ⟨pterm⟩ [else ⟨pterm⟩] (see Section 6.3)
       |  insert ⟨ident⟩(seq⟨pterm⟩); ⟨pterm⟩                       (see Section 4.1.5)
       |  get ⟨ident⟩(seq⟨pattern⟩) [suchthat ⟨pterm⟩] ⟨options⟩ in ⟨pterm⟩ [else ⟨pterm⟩]
                                                                     (see Section 4.1.5)
       |  event ⟨ident⟩[(seq⟨pterm⟩)]; ⟨pterm⟩                      (see Section 3.2.2)
⟨pattern⟩ ::= ⟨ident⟩[: ⟨typeid⟩]
       |  [: ⟨typeid⟩]
       |  ⟨nat⟩
       |  ⟨pattern⟩ + ⟨nat⟩
       |  ⟨nat⟩ + ⟨pattern⟩
       |  (seq⟨pattern⟩)
       |  ⟨ident⟩(seq⟨pattern⟩)
       |  =⟨pterm⟩
⟨mayfailterm⟩ ::= ⟨term⟩
       |  fail
⟨typedecl⟩ ::= seq+⟨ident⟩: ⟨typeid⟩[,⟨typedecl⟩]
⟨failtypedecl⟩ ::= seq+⟨ident⟩: ⟨typeid⟩[or fail][,⟨failtypedecl⟩]
```

The precedences of infix symbols, from low to high, are: `||`, `&&`, `=`, `<>`, `<=`, `>=`, `<`, `>`, and `+`, `-`, which
both have the same precedence and associate to the left as usual. The grammar of terms `⟨term⟩` is
further restricted after parsing. In `reduc` and `equation` declarations, the only allowed function symbols
are constructors, so `||`, `&&`, `=`, `<>`, `<=`, `>=`, `<`, `>`, `-`, `not` are not allowed, and names are not allowed as
identifiers. In `noninterf` declarations, the only allowed function symbols are constructors and names are
allowed as identifiers. In `elimtrue` declarations, the term can only be a fact of the form `p(M1,...,Mk)` for
some predicate `p`; names are not allowed as identifiers. In `clauses` (Figure A.7), the hypothesis of clauses
can be conjunctions of facts of the form `p(M1,...,Mk)` for some predicate `p`, equalities, disequalities, or
inequalities; the conclusion of clauses can only be a fact of the form `p(M1,...,Mk)` for some predicate
`p`; names are not allowed as identifiers.

**Figure A.2 — Grammar for declarations**

```
⟨decl⟩ ::= type ⟨ident⟩ ⟨options⟩.                                                (see Section 3.1.1)
       |  channel seq+⟨ident⟩.                                                      (see Section 6.8)
       |  free seq+⟨ident⟩: ⟨typeid⟩ ⟨options⟩.                                   (see Section 3.1.1)
       |  const seq+⟨ident⟩: ⟨typeid⟩ ⟨options⟩.                                  (see Section 4.1.1)
       |  fun ⟨ident⟩(seq⟨typeid⟩): ⟨typeid⟩ ⟨options⟩.                           (see Section 3.1.1)
       |  letfun ⟨ident⟩[([⟨typedecl⟩])] = ⟨pterm⟩.                               (see Section 4.2.3)
       |  reduc ⟨eqlist⟩ ⟨options⟩.                                               (see Section 3.1.1)
           where ⟨eqlist⟩ is defined in Figure A.3
       |  fun ⟨ident⟩(seq⟨typeid⟩): ⟨typeid⟩ reduc ⟨mayfailreduc⟩ ⟨options⟩.      (see Section 4.2.1)
           where ⟨mayfailreduc⟩ is defined in Figure A.3
       |  equation ⟨eqlist⟩ ⟨options⟩.                                            (see Section 4.2.2)
           where ⟨eqlist⟩ is defined in Figure A.3
       |  pred ⟨ident⟩[(seq⟨typeid⟩)] ⟨options⟩.                                    (see Section 6.3)
       |  table ⟨ident⟩(seq⟨typeid⟩).                                             (see Section 4.1.5)
       |  let ⟨ident⟩[([⟨typedecl⟩])] = ⟨process⟩.                                (see Section 3.1.3)
           where ⟨process⟩ is specified in Figure A.8.
       |  set ⟨name⟩ = ⟨value⟩.                                                   (see Section 6.6.2)
           where the possible values of ⟨name⟩ and ⟨value⟩ are listed in Section 6.6.2.
       |  event ⟨ident⟩[(seq⟨typeid⟩)].                                           (see Section 3.2.2)
       |  query [⟨typedecl⟩;] ⟨query⟩ ⟨options⟩.                             (see Sections 3.2, 4.3.1)
           where ⟨query⟩ is defined in Figure A.4.
       |  (axiom | restriction | lemma) [⟨typedecl⟩;] ⟨lemma⟩ ⟨options⟩.            (see Section 6.2)
           where ⟨lemma⟩ is defined in Figure A.4.
       |  noninterf [⟨typedecl⟩;] seq⟨nidecl⟩.                                    (see Section 4.3.2)
           where ⟨nidecl⟩ ::= ⟨ident⟩ [among (seq+⟨term⟩)]
       |  weaksecret ⟨ident⟩.                                                     (see Section 4.3.2)
       |  not [⟨typedecl⟩;] ⟨gterm⟩.                                              (see Section 6.7.2)
           where ⟨gterm⟩ is defined in Figure A.4.
       |  select [⟨typedecl⟩;] ⟨nounifdecl⟩ [/⟨int⟩] [[seq+⟨nounifoption⟩]].      (see Section 6.7.2)
       |  noselect [⟨typedecl⟩;] ⟨nounifdecl⟩ [/⟨int⟩] [[seq+⟨nounifoption⟩]].    (see Section 6.7.2)
       |  nounif [⟨typedecl⟩;] ⟨nounifdecl⟩ [/⟨int⟩] [[seq+⟨nounifoption⟩]].      (see Section 6.7.2)
           where ⟨nounifdecl⟩ and ⟨nounifoption⟩ are defined in Figure A.6.
       |  elimtrue [⟨failtypedecl⟩;] ⟨term⟩.                                        (see Section 6.3)
       |  clauses ⟨clauses⟩.                                                        (see Section 6.3)
           where ⟨clauses⟩ is defined in Figure A.7.
       |  param seq+⟨ident⟩ ⟨options⟩.                                              (see Section 6.8)
       |  proba ⟨ident⟩[(...)] ⟨options⟩.                                           (see Section 6.8)
       |  letproba ⟨ident⟩[(...)] = ....                                            (see Section 6.8)
       |  proof {⟨proof⟩}                                                           (see Section 6.8)
       |  def ⟨ident⟩(seq⟨typeid⟩) {⟨decl⟩*}                                        (see Section 6.8)
       |  expand ⟨ident⟩(seq⟨typeid⟩).                                              (see Section 6.8)
```

**Figure A.3 — Grammar for destructors (see Sections 3.1.1 and 4.2.1) and equations (see Section 4.2.2)**

```
⟨equality⟩ ::= ⟨term⟩ = ⟨term⟩
       |  let ⟨ident⟩ = ⟨term⟩ in ⟨equality⟩
⟨mayfailequality⟩ ::= ⟨ident⟩(seq⟨mayfailterm⟩) = ⟨mayfailterm⟩
       |  let ⟨ident⟩ = ⟨term⟩ in ⟨mayfailequality⟩
⟨eqlist⟩ ::= [forall ⟨typedecl⟩ ;] ⟨equality⟩ [;⟨eqlist⟩]
⟨mayfailreduc⟩ ::= [forall ⟨failtypedecl⟩;] ⟨mayfailequality⟩ [otherwise ⟨mayfailreduc⟩]
```

**Figure A.4 — Grammar for not (see Section 6.7.2), queries (see Sections 3.2 and 4.3.1), and lemmas (see Section 6.2)**

```
⟨query⟩ ::= ⟨gterm⟩ [public vars seq+⟨ident⟩] [; ⟨query⟩]
       |  secret ⟨ident⟩ [public vars seq+⟨ident⟩] ⟨options⟩ [; ⟨query⟩]
       |  putbegin event:seq+⟨ident⟩ [; ⟨query⟩]              (see Section 6.5)
       |  putbegin inj-event:seq+⟨ident⟩ [; ⟨query⟩]          (see Section 6.5)
⟨lemma⟩ ::= ⟨gterm⟩ [; ⟨lemma⟩]
       |  ⟨gterm⟩ for { public vars seq+⟨ident⟩ } [; ⟨lemma⟩]
       |  ⟨gterm⟩ for { secret ⟨ident⟩ [public vars seq+⟨ident⟩] [real or random] } [; ⟨lemma⟩]
⟨gterm⟩ ::= ⟨ident⟩
       |  ⟨ident⟩(seq⟨gterm⟩) [phase ⟨nat⟩] [@⟨ident⟩]
       |  choice[⟨gterm⟩,⟨gterm⟩]
       |  ⟨gterm⟩ ⟨infix⟩ ⟨gterm⟩
       |  ⟨gterm⟩ (+ | -) ⟨nat⟩
       |  ⟨nat⟩ + ⟨gterm⟩
       |  event(seq⟨gterm⟩) [@⟨ident⟩]
       |  inj-event(seq⟨gterm⟩) [@⟨ident⟩]
       |  ⟨gterm⟩ ==> ⟨gterm⟩
       |  (seq⟨gterm⟩)
       |  new ⟨ident⟩[[[⟨gbinding⟩]]]                         (see Section 6.4)
       |  let ⟨ident⟩ = ⟨gterm⟩ in ⟨gterm⟩                    (see Section 6.4)
⟨gbinding⟩ ::= !⟨nat⟩ = ⟨gterm⟩ [; ⟨gbinding⟩]
       |  ⟨ident⟩ = ⟨gterm⟩ [; ⟨gbinding⟩]
```

The precedences of infix symbols, from low to high, are: `==>`, `||`, `&&`, `=`, `<>`, `<=`, `>=`, `<`, `>`, and `+`, `-`, which
both have the same precedence and associate to the left as usual. The grammar above is useful to know
exactly how terms are parsed and where parentheses are needed. However, it is further restricted after
parsing, so that the grammar of `⟨gterm⟩` in queries and lemmas is in fact the one of `q` in Figure A.5 and
the grammar of `⟨gterm⟩` in `not` declarations is the one of `F` in Figure A.5 excluding events, equalities,
disequalities, and inequalities.

**Figure A.5 — Grammar for not, queries, and lemmas restricted after parsing**

```
q ::=                          query
   F1&&...&&Fn                 reachability
   F1&&...&&Fn ==> H           correspondence
   let x = A in q              let binding, see Section 6.4
H ::=                          hypothesis
   F                           fact
   M=N                         equality
   M<>N                        disequality
   M>N                         greater
   M<N                         smaller
   M>=N                        greater or equal
   M<=N                        smaller or equal
   is nat(M)                   M is a natural number
   H&&H                        conjunction
   H||H                        disjunction
   false                       constant false
   F ==> H                     nested correspondence
   let x = A in H              let binding, see Section 6.4
F ::=                          fact
   AF                          action fact
   AF@x                        action fact executed at time x
   p(M1,...,Mn)                user-defined predicate, see Section 6.3
   let x = A in F              let binding, see Section 6.4
AF ::=                         action fact
   attacker(A)                 the adversary has A (in any phase)
   attacker(A) phase n         the adversary has A in phase n
   mess(B,A)                   A is sent on channel B (in the last phase)
   mess(B,A) phase n           A is sent on channel B in phase n
   event(e(A1,...,An))         non-injective event
   inj-event(e(A1,...,An))     injective event
M,N ::=                        term
   x,a,c                       variable, free name, or constant
   0,1,...                     natural numbers
   f(M1,...,Mn)                constructor application
   (M1,...,Mn)                 tuple
   M+i                         addition, i ∈ N
   i + M                       addition, i ∈ N
   M-i                         subtraction, i ∈ N
   new a[g1 = M1, ..., gk = Mk]   bound name (g ::= !n | x), see Section 6.4
   let x = M in N              let binding, see Section 6.4
A,B ::=                        biterm
   ...                         same cases as terms
   choice[A,B]                 choice
```

**Figure A.6 — Grammar for nounif (see Section 6.7.2)**

```
⟨nounifdecl⟩ ::= let ⟨ident⟩ = ⟨gformat⟩ in ⟨nounifdecl⟩
       |  ⟨ident⟩[(seq⟨gformat⟩) [phase ⟨nat⟩]]
⟨gformat⟩ ::= ⟨ident⟩
       |  *⟨ident⟩
       |  ⟨ident⟩(seq⟨gformat⟩)
       |  choice[⟨gformat⟩,⟨gformat⟩]
       |  not(seq⟨gformat⟩)
       |  (seq⟨gformat⟩)
       |  new ⟨ident⟩[[[⟨fbinding⟩]]]
       |  let ⟨ident⟩ = ⟨gformat⟩ in ⟨gformat⟩
⟨fbinding⟩ ::= !⟨nat⟩ = ⟨gformat⟩ [; ⟨fbinding⟩]
       |  ⟨ident⟩ = ⟨gformat⟩ [; ⟨fbinding⟩]
⟨nounifoption⟩ ::= hypothesis
       |  conclusion
       |  ignoreAFewTimes
       |  inductionOn = ⟨ident⟩
       |  inductionOn = {seq+⟨ident⟩}
```

**Figure A.7 — Grammar for clauses (see Section 6.3)**

```
⟨clauses⟩ ::= [forall ⟨failtypedecl⟩;] ⟨clause⟩ [; ⟨clauses⟩]
⟨clause⟩ ::= ⟨term⟩
       |  ⟨term⟩ -> ⟨term⟩
       |  ⟨term⟩ <-> ⟨term⟩
       |  ⟨term⟩ <=> ⟨term⟩
```

**Figure A.8 — Grammar for processes (see Section 3.1.4)**

```
⟨process⟩ ::= 0
       |  yield                                                                     (see Section 6.8)
       |  ⟨ident⟩[(seq⟨pterm⟩)]
       |  (⟨process⟩)
       |  ⟨process⟩ | ⟨process⟩
       |  !⟨process⟩
       |  ! ⟨ident⟩ <= ⟨ident⟩ ⟨process⟩                                            (see Section 6.8)
       |  foreach ⟨ident⟩ <= ⟨ident⟩ do ⟨process⟩                                   (see Section 6.8)
       |  new ⟨ident⟩[[seq⟨ident⟩]]: ⟨typeid⟩ [; ⟨process⟩]
       |  ⟨ident⟩ <-R ⟨typeid⟩ [; ⟨process⟩]                                        (see Section 6.8)
       |  if ⟨pterm⟩ then ⟨process⟩ [else ⟨process⟩]
       |  in(⟨pterm⟩,⟨pattern⟩) ⟨options⟩ [; ⟨process⟩]
       |  out(⟨pterm⟩,⟨pterm⟩) [; ⟨process⟩]
       |  let ⟨pattern⟩ = ⟨pterm⟩ [in ⟨process⟩ [else ⟨process⟩]]
       |  ⟨ident⟩[:⟨typeid⟩] <- ⟨pterm⟩ [;⟨process⟩]                                (see Section 6.8)
       |  let ⟨typedecl⟩ suchthat ⟨pterm⟩ ⟨options⟩ [in ⟨process⟩ [else ⟨process⟩]]
                                                                                     (see Section 6.3)
       |  insert ⟨ident⟩(seq⟨pterm⟩) [; ⟨process⟩]                                  (see Section 4.1.5)
       |  get ⟨ident⟩(seq⟨pattern⟩) [suchthat ⟨pterm⟩] ⟨options⟩ [in ⟨process⟩ [else ⟨process⟩]]
                                                                                     (see Section 4.1.5)
       |  event ⟨ident⟩[(seq⟨pterm⟩)] [; ⟨process⟩]                                 (see Section 3.2.2)
       |  phase ⟨nat⟩ [; ⟨process⟩]                                                 (see Section 4.1.6)
       |  sync ⟨nat⟩ [[⟨tag⟩]] [; ⟨process⟩]                                        (see Section 4.1.7)
```
