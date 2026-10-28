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
import { render, screen } from 'spec/helpers/testing-library';
import AddDataset, { datasetReducer } from 'src/pages/DatasetCreation';
import {
  DatasetActionType,
  DatasetObject,
} from 'src/features/datasets/AddDataset/types';

const mockHistoryPush = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({
    push: mockHistoryPush,
  }),
  useParams: () => ({ datasetId: undefined }),
}));

// eslint-disable-next-line no-restricted-globals -- TODO: Migrate from describe blocks
describe('AddDataset', () => {
  test('renders a blank state AddDataset', async () => {
    render(<AddDataset />, { useRedux: true, useRouter: true });

    const blankeStateImgs = screen.getAllByRole('img', { name: /empty/i });

    // Header
    expect(await screen.findByText(/new dataset/i)).toBeVisible();
    // Left panel
    expect(blankeStateImgs[0]).toBeVisible();
    // Footer
    expect(screen.getByText(/Cancel/i)).toBeVisible();

    expect(blankeStateImgs.length).toBe(1);
  });
});

test('stores multiple tables and clears selections when the schema changes', () => {
  const selected = datasetReducer(null, {
    type: DatasetActionType.SelectTables,
    payload: ['customers', 'orders'],
  }) as DatasetObject;
  expect(selected.table_names).toEqual(['customers', 'orders']);
  expect(selected.table_name).toBeNull();
  expect(
    datasetReducer(selected, {
      type: DatasetActionType.SelectSchema,
      payload: { name: 'schema', value: 'other' },
    }),
  ).toMatchObject({ schema: 'other', table_names: [], table_name: null });
});

test('keeps the single-table preview available for a one-table selection', () => {
  expect(
    datasetReducer(null, {
      type: DatasetActionType.SelectTables,
      payload: ['customers'],
    }),
  ).toMatchObject({ table_names: ['customers'], table_name: 'customers' });
});

test('keeps schema-qualified table selections and clears them when the connection changes', () => {
  const selected = datasetReducer(null, {
    type: DatasetActionType.SelectTableReferences,
    payload: [
      { schema: 'public', table_name: 'orders' },
      { schema: 'sales', table_name: 'orders' },
    ],
  }) as DatasetObject;
  expect(selected.selected_tables).toHaveLength(2);
  expect(selected.table_name).toBeNull();
  expect(
    datasetReducer(selected, {
      type: DatasetActionType.SelectDatabase,
      payload: { db: { id: 2, database_name: 'other' } },
    }),
  ).toMatchObject({ selected_tables: [], table_names: [], table_name: null });
  expect(
    datasetReducer(selected, {
      type: DatasetActionType.SelectTableReferences,
      payload: [{ schema: 'sales', table_name: 'orders' }],
    }),
  ).toMatchObject({ schema: 'sales', table_name: 'orders' });
});
