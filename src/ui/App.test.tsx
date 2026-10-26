import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db/db.ts';
import { App } from './App.tsx';

describe('App', () => {
  it('asks for a profile on first run', async () => {
    render(<App db={openDb('app-test')} />);
    expect(await screen.findByRole('heading', { name: 'Fitness Quest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start the adventure' })).toBeInTheDocument();
  });
});
