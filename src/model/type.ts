export interface Type {
  prefixObjectKey: string;
  id: string;
  objectType: string;
  objectKey: string;
  changeLogComment: string | null;
  createdBy: string | null;
  createdDate: number | null;
  modifiedBy: string | null;
  modifiedDate: number | null;
  // modifiedTimestamp: null;
  createdByName: string | null;
  modifiedByName: string | null;
  createdDateField: number | null;
  modifiedDateField: number | null;
  createdMode: string | null;
  modifiedMode: string | null;
  recordIndex: number | null;
  readOnly: boolean;
  backgroundUpdate: boolean;
  typeId: string;
  typeName: string;
  typeValues: string | null;
  typeValuesCount: number;
  adjustable: string;
  RowId: string;
  // highlight: null;
}
