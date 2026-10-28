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
import { useEffect, useState, useCallback, Dispatch } from 'react';
import { SupersetClient } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { useTheme } from '@apache-superset/core/theme';
import { Flex, Checkbox, Typography } from '@superset-ui/core/components';
import { DatabaseSelector } from 'src/components/DatabaseSelector';
import type { DatabaseObject } from 'src/components';
import { TableBrowser } from 'src/SqlLab/components/TableExploreTree';
import type { TableReference } from 'src/SqlLab/components/TableExploreTree/types';
import { useToasts } from 'src/components/MessageToasts/withToasts';
import { LocalStorageKeys, getItem } from 'src/utils/localStorageHelpers';
import {
  DatasetActionType,
  DatasetObject,
  DSReducerActionType,
} from '../types';

interface LeftPanelProps {
  setDataset: Dispatch<DSReducerActionType>;
  dataset?: Partial<DatasetObject> | null;
  onPreviewTable: (table: TableReference) => void;
  onDatasetCreated: () => void;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}

export default function LeftPanel({
  setDataset,
  dataset,
  onPreviewTable,
  onDatasetCreated,
  disabled = false,
  onBusyChange,
}: LeftPanelProps) {
  const theme = useTheme();
  const { addDangerToast, addSuccessToast } = useToasts();
  const [multiple, setMultiple] = useState(false);
  const [creating, setCreating] = useState(false);
  const setDatabase = useCallback(
    (db: DatabaseObject) => {
      setDataset({ type: DatasetActionType.SelectDatabase, payload: { db } });
    },
    [setDataset],
  );

  useEffect(() => {
    const previous = getItem(
      LocalStorageKeys.Database,
      null,
    ) as DatabaseObject | null;
    if (previous) setDatabase(previous);
  }, [setDatabase]);

  const selectTables = (tables: TableReference[]) => {
    setDataset({
      type: DatasetActionType.SelectTableReferences,
      payload: tables,
    });
    if (tables.length === 1) onPreviewTable(tables[0]);
  };
  const previewTable = (table: TableReference) => {
    onPreviewTable(table);
    if (!multiple) selectTables([table]);
  };
  const createDataset = async (table: TableReference) => {
    if (!dataset?.db || creating) return;
    setCreating(true);
    onBusyChange(true);
    try {
      await SupersetClient.post({
        endpoint: '/api/v1/dataset/',
        jsonPayload: {
          database: dataset.db.id,
          catalog: dataset.catalog,
          schema: table.schema || null,
          table_name: table.table_name,
        },
      });
      addSuccessToast(
        t('Dataset created from %s.%s', table.schema, table.table_name),
      );
      onDatasetCreated();
    } catch {
      addDangerToast(
        t(
          'Unable to create dataset. It may already exist, or you may not have access.',
        ),
      );
    } finally {
      setCreating(false);
      onBusyChange(false);
    }
  };

  return (
    <Flex
      vertical
      gap="small"
      style={{ height: '100%', padding: theme.sizeUnit * 4 }}
    >
      <DatabaseSelector
        showSchema={false}
        db={dataset?.db}
        handleError={addDangerToast}
        readOnly={disabled || creating}
        onDbChange={setDatabase}
        catalog={dataset?.catalog}
        onCatalogChange={catalog =>
          setDataset({
            type: DatasetActionType.SelectCatalog,
            payload: { name: 'catalog', value: catalog },
          })
        }
      />
      {dataset?.db && (
        <>
          <Checkbox
            checked={multiple}
            disabled={disabled || creating}
            onChange={event => {
              setMultiple(event.target.checked);
              selectTables([]);
            }}
          >
            {t('Select multiple tables')}
          </Checkbox>
          <Typography.Text type="secondary">
            {t(
              'Select a table to preview its columns. Expand schemas to browse tables and views.',
            )}
          </Typography.Text>
          <TableBrowser
            key={`${dataset.db.id}:${dataset.catalog ?? ''}`}
            dbId={dataset.db.id}
            supportsSchemas={dataset.db.supports_schemas}
            catalog={dataset.catalog}
            onPreviewTable={disabled || creating ? undefined : previewTable}
            onCreateDataset={createDataset}
            creatingDataset={disabled || creating}
            selectedTables={dataset.selected_tables}
            disabled={disabled || creating}
            onSelectionChange={multiple ? selectTables : undefined}
            showSelectAll={multiple}
            maxSelection={100}
          />
        </>
      )}
    </Flex>
  );
}
