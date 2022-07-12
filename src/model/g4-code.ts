export interface G4Code {
    prefixObjectKey: string,
    id: string,
    objectType: string,
    objectKey: string,
    changeLogComment: string|null,
    createdBy: string|null,
    createdDate: number|null,
    modifiedBy: string|null,
    modifiedDate: number|null,
    // modifiedTimestamp: null,
    createdByName: string|null,
    modifiedByName: string|null,
    createdDateField: number|null,
    modifiedDateField: number|null,
    createdMode: string|null,
    modifiedMode: string|null,
    recordIndex: number|null,
    readOnly: boolean,
    backgroundUpdate: boolean,
    g4Code: string,
    g3Code: string,
    g2Code: string,
    g1Code: string,
    description: string,
    companyCode: string,
    unlocation: string|null,
    associatedG4: string|null,
    cfsyncStatus: string|null,
    activationStatus: string|null,
    timeZone: string|null,
    companyName: string|null,
    g3CodeDescription: string|null,
    g2CodeDescription: string|null,
    g1CodeDescription: string|null,
    RowId: string,
    // highlight: null
  }