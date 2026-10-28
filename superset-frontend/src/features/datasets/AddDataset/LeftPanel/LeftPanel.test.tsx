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
import {
  render,
  screen,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import fetchMock from 'fetch-mock';
import type { TableBrowserProps } from 'src/SqlLab/components/TableExploreTree';
import LeftPanel from '.';
import { DatasetActionType } from '../types';

jest.mock('src/components/DatabaseSelector', () => ({
  DatabaseSelector: () => <span>Database selector</span>,
}));
jest.mock('src/SqlLab/components/TableExploreTree', () => ({
  __esModule: true,
  TableBrowser: (props: TableBrowserProps) => (
    <>
      <button
        type="button"
        onClick={() =>
          props.onPreviewTable?.({ schema: 'public', table_name: 'orders' })
        }
      >
        Preview orders
      </button>
      <button
        type="button"
        disabled={!props.onSelectionChange}
        onClick={() =>
          props.onSelectionChange?.([
            { schema: 'public', table_name: 'orders' },
            { schema: 'sales', table_name: 'orders' },
          ])
        }
      >
        Check tables
      </button>
      <button
        type="button"
        disabled={props.creatingDataset}
        onClick={() =>
          props.onCreateDataset?.({ schema: 'sales', table_name: 'orders' })
        }
      >
        Create orders
      </button>
    </>
  ),
}));

const props = {
  setDataset: jest.fn(),
  onPreviewTable: jest.fn(),
  onDatasetCreated: jest.fn(),
  onBusyChange: jest.fn(),
  dataset: { db: { id: 1, database_name: 'examples' }, catalog: 'main' },
};
afterEach(() => {
  jest.clearAllMocks();
  fetchMock.removeRoutes().clearHistory();
});

test('clicking a table preserves the single-table creation workflow', async () => {
  render(<LeftPanel {...props} />, { useRedux: true });
  await userEvent.click(screen.getByText('Preview orders'));
  expect(props.onPreviewTable).toHaveBeenCalledWith({
    schema: 'public',
    table_name: 'orders',
  });
  expect(props.setDataset).toHaveBeenCalledWith({
    type: DatasetActionType.SelectTableReferences,
    payload: [{ schema: 'public', table_name: 'orders' }],
  });
});

test('checkbox mode is opt-in and table previews do not replace checked tables', async () => {
  render(<LeftPanel {...props} />, { useRedux: true });
  expect(screen.getByText('Check tables')).toBeDisabled();
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Select multiple tables' }),
  );
  await userEvent.click(screen.getByText('Check tables'));
  expect(props.setDataset).toHaveBeenLastCalledWith({
    type: DatasetActionType.SelectTableReferences,
    payload: [
      { schema: 'public', table_name: 'orders' },
      { schema: 'sales', table_name: 'orders' },
    ],
  });
  props.setDataset.mockClear();
  await userEvent.click(screen.getByText('Preview orders'));
  expect(props.setDataset).not.toHaveBeenCalled();
});

test('creates a dataset from the table action without opening a chart', async () => {
  fetchMock.post('glob:*/api/v1/dataset/', { id: 10 });
  render(<LeftPanel {...props} />, { useRedux: true });
  await userEvent.click(screen.getByText('Create orders'));
  await waitFor(() => expect(props.onDatasetCreated).toHaveBeenCalled());
  const call = fetchMock.callHistory.lastCall('glob:*/api/v1/dataset/');
  expect(JSON.parse(String(call?.options.body))).toEqual({
    database: 1,
    catalog: 'main',
    schema: 'sales',
    table_name: 'orders',
  });
  expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
});
