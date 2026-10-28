/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useState, type ReactNode } from 'react';
import fetchMock from 'fetch-mock';
import {
  render,
  screen,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import { TableBrowser } from '.';
import type { TableReference } from './types';

jest.mock(
  'react-virtualized-auto-sizer',
  () =>
    ({ children }: { children: (size: { height: number }) => ReactNode }) =>
      children({ height: 500 }),
);

beforeEach(() => {
  fetchMock.get('glob:*/api/v1/database/1/schemas/?*', {
    result: ['public', 'sales'],
  });
  fetchMock.get('glob:*/api/v1/database/1/tables/*', {
    result: [{ label: 'orders', value: 'orders', type: 'table' }],
    count: 1,
  });
  fetchMock.get('glob:*/api/v1/database/1/table_metadata/*', {
    columns: [{ name: 'id', type: 'INTEGER' }],
  });
  fetchMock.get('glob:*/api/v1/database/1/table_metadata/extra/*', {});
});
afterEach(() => fetchMock.removeRoutes().clearHistory());

function Browser({ maxSelection = 100 }: { maxSelection?: number }) {
  const [selectedTables, setSelectedTables] = useState<TableReference[]>([]);
  return (
    <TableBrowser
      dbId={1}
      selectedTables={selectedTables}
      onSelectionChange={setSelectedTables}
      maxSelection={maxSelection}
      showSelectAll
    />
  );
}

test('works without SQL Lab editor state and selects tables from different schemas', async () => {
  render(<Browser />, { useRedux: true });
  await userEvent.click(await screen.findByText('public'));
  await userEvent.click(
    await screen.findByRole('checkbox', { name: 'Select table public.orders' }),
  );
  await userEvent.click(screen.getByText('sales'));
  await userEvent.click(
    await screen.findByRole('checkbox', { name: 'Select table sales.orders' }),
  );
  expect(screen.getByText('2 selected')).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: 'Select table public.orders' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Select table sales.orders' }),
  ).toBeChecked();
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear selection' }),
  );
  expect(screen.getByText('0 selected')).toBeVisible();
});

test('limits selection and permits deselecting at the limit', async () => {
  render(<Browser maxSelection={1} />, { useRedux: true });
  await userEvent.click(await screen.findByText('public'));
  await userEvent.click(
    await screen.findByRole('checkbox', { name: 'Select table public.orders' }),
  );
  await userEvent.click(screen.getByText('sales'));
  expect(
    await screen.findByRole('checkbox', { name: 'Select table sales.orders' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Select table public.orders' }),
  );
  expect(
    screen.getByRole('checkbox', { name: 'Select table sales.orders' }),
  ).toBeEnabled();
});

test('select-all includes only loaded tables matching the search', async () => {
  render(<Browser />, { useRedux: true });
  expect(
    screen.getByRole('button', { name: 'Select loaded tables' }),
  ).toBeDisabled();
  await userEvent.click(await screen.findByText('public'));
  await screen.findByRole('checkbox', { name: 'Select table public.orders' });
  await userEvent.type(
    screen.getByPlaceholderText('Enter a part of the object name'),
    'orders',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Select loaded tables' }),
  );
  expect(screen.getByText('1 selected')).toBeVisible();
  expect(
    fetchMock.callHistory.calls('glob:*/api/v1/database/1/tables/*'),
  ).toHaveLength(1);
});

test('offers creation only when configured and passes the full table location', async () => {
  const create = jest.fn();
  render(<TableBrowser dbId={1} onCreateDataset={create} />, {
    useRedux: true,
  });
  await userEvent.click(await screen.findByText('public'));
  await userEvent.click(
    await screen.findByTestId('Create dataset from public.orders'),
  );
  expect(create).toHaveBeenCalledWith({
    schema: 'public',
    table_name: 'orders',
  });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('supports databases without schemas', async () => {
  render(<TableBrowser dbId={1} supportsSchemas={false} />, { useRedux: true });
  await userEvent.click(await screen.findByText('Tables'));
  await waitFor(() => expect(screen.getByText('orders')).toBeVisible());
});
