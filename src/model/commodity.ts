export interface Commodity {
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
  commodityCode: string;
  commodityName: string;
  activationStatus: string;
  description: string;
  RowId: string;
  // highlight: null;
}
