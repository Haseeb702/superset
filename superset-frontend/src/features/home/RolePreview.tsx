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
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { SupersetClient } from '@superset-ui/core';
import { Alert } from '@apache-superset/core/components';
import {
  Button,
  Flex,
  Modal,
  Select,
  Typography,
} from '@superset-ui/core/components';
import { t } from '@apache-superset/core/translation';
import { useToasts } from 'src/components/MessageToasts/withToasts';
import { UserWithPermissionsAndRoles } from 'src/types/bootstrapTypes';
import { ensureAppRoot } from 'src/utils/navigationUtils';

interface RoleOption {
  id: number;
  name: string;
}

const endpoint = '/api/v1/security/role_preview/';

export default function RolePreview() {
  const user = useSelector<
    { user: UserWithPermissionsAndRoles },
    UserWithPermissionsAndRoles
  >(state => state.user);
  const { addDangerToast } = useToasts();
  const [show, setShow] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selected, setSelected] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user?.canPreviewRoles) return null;

  const open = async () => {
    setShow(true);
    setLoading(true);
    setSelected(user.rolePreview?.id);
    try {
      const { json } = await SupersetClient.get({ endpoint });
      setRoles(json.roles);
    } catch {
      addDangerToast(t('Unable to load roles.'));
    } finally {
      setLoading(false);
    }
  };

  const changePreview = async (exit: boolean) => {
    setSaving(true);
    try {
      if (exit) {
        await SupersetClient.delete({ endpoint });
      } else {
        await SupersetClient.post({
          endpoint,
          jsonPayload: { role_id: selected },
        });
      }
      // Reload both bootstrap permissions and navigation from the server.
      window.location.assign(ensureAppRoot('/superset/welcome/'));
    } catch {
      addDangerToast(t('Unable to change role preview. Please try again.'));
      setSaving(false);
    }
  };

  return (
    <>
      {user.rolePreview ? (
        <Alert
          type="warning"
          showIcon
          message={t('Previewing as %s — read-only', user.rolePreview.name)}
          description={t(
            'Only this role’s permissions apply. Your Admin, personal ownership, and group grants are excluded.',
          )}
          action={
            <Flex gap="small">
              <Button onClick={open} disabled={saving}>
                {t('Change role')}
              </Button>
              <Button onClick={() => changePreview(true)} loading={saving}>
                {t('Exit preview')}
              </Button>
            </Flex>
          }
        />
      ) : (
        <Flex justify="flex-end">
          <Button onClick={open}>{t('Preview as role')}</Button>
        </Flex>
      )}
      <Modal
        show={show}
        onHide={() => setShow(false)}
        title={t('Preview as role')}
        primaryButtonName={t('Start preview')}
        disablePrimaryButton={selected === undefined || loading || saving}
        primaryButtonLoading={saving}
        onHandledPrimaryAction={() => changePreview(false)}
      >
        <Flex vertical gap="middle">
          <Typography.Paragraph>
            {t(
              'Select a role to preview which datasets, charts, and dashboards it can access. Editing and SQL Lab are disabled during preview.',
            )}
          </Typography.Paragraph>
          <Select<number>
            ariaLabel={t('Role to preview')}
            placeholder={t('Select a role')}
            options={roles.map(role => ({ label: role.name, value: role.id }))}
            value={selected}
            onChange={setSelected}
            loading={loading}
            disabled={saving}
            showSearch
          />
        </Flex>
      </Modal>
    </>
  );
}
