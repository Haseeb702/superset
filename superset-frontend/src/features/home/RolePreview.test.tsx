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
import fetchMock from 'fetch-mock';
import {
  render,
  screen,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import RolePreview from './RolePreview';

const mockAddDangerToast = jest.fn();
jest.mock('src/components/MessageToasts/withToasts', () => ({
  ...jest.requireActual('src/components/MessageToasts/withToasts'),
  useToasts: () => ({ addDangerToast: mockAddDangerToast }),
}));

const endpoint = 'glob:*/api/v1/security/role_preview/';
afterEach(() => fetchMock.removeRoutes().clearHistory());

test('does not expose preview controls to ordinary users', () => {
  render(<RolePreview />, {
    useRedux: true,
    initialState: { user: { username: 'viewer' } },
  });
  expect(
    screen.queryByRole('button', { name: 'Preview as role' }),
  ).not.toBeInTheDocument();
});

test('shows the active role and an exit control after permissions are reduced', () => {
  render(<RolePreview />, {
    useRedux: true,
    initialState: {
      user: {
        canPreviewRoles: true,
        rolePreview: { id: 7, name: 'Sales Analyst' },
        roles: { 'Sales Analyst': [] },
      },
    },
  });
  expect(
    screen.getByText('Previewing as Sales Analyst — read-only'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Exit preview' })).toBeEnabled();
});

test('loads real role options and submits the selected role', async () => {
  fetchMock.get(endpoint, {
    roles: [{ id: 7, name: 'Sales Analyst' }],
    result: null,
  });
  fetchMock.post(endpoint, { status: 500, body: { message: 'Test error' } });
  render(<RolePreview />, {
    useRedux: true,
    initialState: { user: { canPreviewRoles: true } },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Preview as role' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Start preview' }),
    ).toBeDisabled(),
  );
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Role to preview' }),
  );
  await userEvent.click(await screen.findByText('Sales Analyst'));
  await userEvent.click(screen.getByRole('button', { name: 'Start preview' }));
  await waitFor(() => {
    const call = fetchMock.callHistory.lastCall(endpoint, { method: 'POST' });
    expect(JSON.parse(String(call?.options.body))).toEqual({ role_id: 7 });
  });
  await waitFor(() =>
    expect(mockAddDangerToast).toHaveBeenCalledWith(
      'Unable to change role preview. Please try again.',
    ),
  );
});

test('exit calls the control endpoint even while the effective role is restricted', async () => {
  fetchMock.delete(endpoint, { status: 500, body: { message: 'Test error' } });
  render(<RolePreview />, {
    useRedux: true,
    initialState: {
      user: {
        canPreviewRoles: true,
        rolePreview: { id: 7, name: 'Sales Analyst' },
      },
    },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Exit preview' }));
  await waitFor(() =>
    expect(
      fetchMock.callHistory.calls(endpoint, { method: 'DELETE' }),
    ).toHaveLength(1),
  );
});
