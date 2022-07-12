export interface TypeValue {
  // prefixObjectKey: null;
  id: string;
  objectType: string;
  objectKey: string;
  changeLogComment: string|null;
  createdBy: string|null;
  createdDate: number|null;
  modifiedBy: string|null;
  modifiedDate: number|null;
  // modifiedTimestamp: number|null;
  createdByName: string|null;
  modifiedByName: string|null;
  createdDateField: string|null;
  modifiedDateField: string|null;
  createdMode:string|null;
  modifiedMode: string|null;
  recordIndex: number|null;
  readOnly: boolean;
  backgroundUpdate: boolean;
  typeValueId: string;
  typeId: string;
  typeValue: string|null;
  activationStatus: string|null;
  sortKey: number;
  adjustable: string;
  typeName: string|null;
  RowId: string;
  // highlight: null;
}
