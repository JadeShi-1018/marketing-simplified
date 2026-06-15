'use client';



import type { BuilderFieldRow, FieldType } from '@/types/ticketForm';

import FieldTypePaletteList from './FieldTypePaletteList';

import PaletteFieldList from './PaletteFieldList';



interface Props {

  paletteFields: BuilderFieldRow[];

  selectedClientId: string | null;

  selectedFieldType: FieldType | null;

  onSelectPaletteField: (clientId: string) => void;

  onSelectFieldType: (fieldType: FieldType) => void;

}



export default function FieldsPanel({

  paletteFields,

  selectedClientId,

  selectedFieldType,

  onSelectPaletteField,

  onSelectFieldType,

}: Props) {

  return (

    <div className="flex h-full min-h-0 flex-col">

      <div className="shrink-0 px-4 pt-4 pb-3">

        <h2 className="text-base font-semibold text-gray-900">Fields</h2>

        <p className="mt-1 text-sm text-gray-900">

          Drag fields to build your custom form.

        </p>

      </div>



      <div className="dashboard-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">

        <FieldTypePaletteList

          selectedFieldType={selectedFieldType}

          onSelectFieldType={onSelectFieldType}

        />



        {paletteFields.length > 0 && (

          <div className="mt-4 border-t border-gray-100 pt-4">

            <p className="mb-2 text-xs font-medium text-gray-500">Unused fields</p>

            <PaletteFieldList

              paletteFields={paletteFields}

              selectedClientId={selectedClientId}

              onSelect={onSelectPaletteField}

            />

          </div>

        )}

      </div>

    </div>

  );

}

