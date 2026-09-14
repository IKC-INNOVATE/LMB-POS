// Étend `expect` avec les matchers DOM (toBeInTheDocument, toHaveTextContent…)
// utilisés par les tests de composants (__tests__/**/*.test.tsx). Import sans
// effet de bord problématique pour les tests métier en environnement 'node'
// (aucun accès DOM n'a lieu tant qu'un matcher DOM n'est pas réellement appelé).
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// `test.globals` n'est pas activé (les tests métier importent explicitement
// describe/it/expect) : le cleanup automatique de @testing-library/react ne
// se déclenche donc pas tout seul entre deux tests -> on le fait ici pour
// tous les tests de composants (RTL ignore cet appel côté tests 'node' sans
// DOM monté).
afterEach(() => {
  cleanup();
});
