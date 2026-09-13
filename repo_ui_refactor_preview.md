UI Refactor Preview

But: Passe repo-wide pour remplacer les `<input>`, `<select>`, `<textarea>` et boutons par les composants réutilisables sous `components/ui/`.

Résumé des fichiers détectés (extrait) :
- app/admin/audits/page.tsx
- app/admin/customers/page.tsx
- app/admin/finance/page.tsx
- app/admin/inventory/page.tsx
- app/admin/page.tsx
- app/admin/promotions/page.tsx
- app/admin/purchases/page.tsx (déjà modifié)
- app/admin/transfers/page.tsx (déjà modifié)
- app/login/page.tsx
- app/page.tsx
- components/admin/TransferModal.tsx
- components/pos/ReceiptModal.tsx
- components/pos/CashExpenseButton.tsx
- components/pos/CloseRegisterButton.tsx

Proposition de règle de remplacement (exemples):

1) Inputs simples avec la classe canonique `bg-[#111111] border border-gray-700 ...`
Remplacer:
```diff
- <input value={foo} onChange={(e)=>setFoo(e.target.value)} className="w-full rounded-lg border border-gray-700 bg-[#111111] px-3 py-2 text-sm text-white placeholder-gray-400" />
+ <Input value={foo} onChange={(e)=>setFoo(e.target.value)} className="" />
```

2) Selects similaires:
```diff
- <select value={val} onChange={...} className="w-full rounded-lg border border-gray-700 bg-[#111111] px-3 py-2 text-sm">...</select>
+ <Select value={val} onChange={...}>...</Select>
```

3) Textareas:
```diff
- <textarea value={v} onChange={...} className="w-full rounded-lg border border-gray-700 bg-[#111111] px-3 py-2">...</textarea>
+ <Textarea value={v} onChange={...} rows={3} />
```

4) Boutons primaires:
Remplacer boutons avec `bg-emerald-600`, `bg-cyan-600`, ou styles inline par `PrimaryButton` si action principale.
```diff
- <button onClick={fn} className="rounded-lg bg-emerald-600 px-3 py-2 text-white">Ajouter</button>
+ <PrimaryButton onClick={fn}>Ajouter</PrimaryButton>
```

5) Boutons secondaires:
Remplacer boutons `bg-[#111111]` ou `bg-[#1A1A1A]` par `SecondaryButton`.

Notes et recommandations:
- Quelques composants (p.ex. `components/pos/*`) utilisent inputs dans contextes de caisse où le fond est clair (white inputs) — ne pas remplacer les inputs qui ciblent explicitement `bg-white` (ex: cash entry modals). Le preview liste ces cas pour revue.
- Certaines remplacements nécessitent d'ajouter des props (`type`, `min`, `step`, `rows`) — le pattern proposé conserve ces props sur les nouveaux composants.
- Je recommande d'exécuter les remplacements par batchs et de lancer le build entre chaque batch.

Exemple de patchs automatiques prêt à appliquer (preview snippet):
- File: `app/admin/customers/page.tsx`
```diff
@@
- <input className="w-full bg-[#111111] border border-gray-700 rounded-xl px-3 py-2 text-white" ... />
+ <Input ... />
```

- File: `app/page.tsx`
```diff
@@
- <input className="rounded-lg border border-gray-700 bg-[#111111] px-3 py-2" ... />
+ <Input ... />
```

Prochaine étape si vous validez :
- Je peux appliquer ces remplacements automatiquement en 1) ciblant les occurrences `bg-[#111111]`/`bg-slate-950` dans `app/` et `components/`, 2) générant un commit/patch unique. Je préparerai un diff complet pour revue avant commit.

---
Generated on 2026-08-22 by the refactor assistant.
