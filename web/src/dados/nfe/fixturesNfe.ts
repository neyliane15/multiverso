/**
 * XMLs de NFe usados nos testes.
 *
 * São arquivos inventados, mas com a estrutura verdadeira do layout 4.00
 * (`nfeProc > NFe > infNFe > ide/emit/det/total`, `protNFe` de autorização) e
 * com chaves de acesso cujo dígito verificador realmente fecha. Nota de
 * verdade é feia assim: campo repetido, imposto no meio, "SEM GTIN" no lugar
 * do código de barras.
 */

/** Nota com três itens, dhEmi com offset -03:00 e totais que fecham. */
export const CHAVE_MULTI = '35260312345678000195550010000123451987654327'

export const XML_MULTIPLOS_ITENS = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE_MULTI}" versao="4.00">
      <ide>
        <cUF>35</cUF><cNF>98765432</cNF><natOp>VENDA DE MERCADORIA</natOp>
        <mod>55</mod><serie>1</serie><nNF>12345</nNF>
        <dhEmi>2026-03-12T21:40:00-03:00</dhEmi>
        <dhSaiEnt>2026-03-12T22:10:00-03:00</dhSaiEnt>
        <tpNF>1</tpNF><idDest>1</idDest><cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>7</cDV><tpAmb>1</tpAmb>
        <finNFe>1</finNFe><indFinal>0</indFinal><indPres>0</indPres>
        <procEmi>0</procEmi><verProc>4.00</verProc>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <xNome>DISTRIBUIDORA DE BEBIDAS SAO PAULO LTDA</xNome>
        <xFant>DISTRISP</xFant>
        <enderEmit>
          <xLgr>AVENIDA DAS INDUSTRIAS</xLgr><nro>1200</nro><xCpl>GALPAO 3</xCpl>
          <xBairro>DISTRITO INDUSTRIAL</xBairro><cMun>3550308</cMun>
          <xMun>SAO PAULO</xMun><UF>SP</UF><CEP>04711000</CEP>
          <cPais>1058</cPais><xPais>BRASIL</xPais><fone>1133334444</fone>
        </enderEmit>
        <IE>123456789012</IE><CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>99887766000155</CNPJ>
        <xNome>RESTAURANTE MULTIVERSO LTDA</xNome>
        <enderDest>
          <xLgr>RUA DOS SABORES</xLgr><nro>45</nro><xBairro>CENTRO</xBairro>
          <cMun>3550308</cMun><xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01010000</CEP>
          <cPais>1058</cPais><xPais>BRASIL</xPais>
        </enderDest>
        <indIEDest>1</indIEDest><IE>110042490114</IE>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>7891</cProd><cEAN>7896045506873</cEAN>
          <xProd>CERVEJA HEINEKEN LONG NECK 330ML CX C/24</xProd>
          <NCM>22030000</NCM><CFOP>5102</CFOP><uCom>CX</uCom>
          <qCom>10.0000</qCom><vUnCom>89.9000000000</vUnCom><vProd>899.00</vProd>
          <cEANTrib>7896045506873</cEANTrib><uTrib>CX</uTrib>
          <qTrib>10.0000</qTrib><vUnTrib>89.9000000000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC>
            <vBC>899.00</vBC><pICMS>18.00</pICMS><vICMS>161.82</vICMS>
          </ICMS00></ICMS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>0045</cProd><cEAN>SEM GTIN</cEAN>
          <xProd>ACUCAR REFINADO UNIAO 1KG</xProd>
          <NCM>17019900</NCM><CFOP>5102</CFOP><uCom>PCT</uCom>
          <qCom>20.0000</qCom><vUnCom>4.5000000000</vUnCom><vProd>90.00</vProd>
          <cEANTrib>SEM GTIN</cEANTrib><uTrib>PCT</uTrib>
          <qTrib>20.0000</qTrib><vUnTrib>4.5000000000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto>
      </det>
      <det nItem="3">
        <prod>
          <cProd>PIC-RESF</cProd><cEAN>SEM GTIN</cEAN>
          <xProd>PICANHA BOVINA RESFRIADA A VACUO</xProd>
          <NCM>02013000</NCM><CFOP>5102</CFOP><uCom>KG</uCom>
          <qCom>12.5000</qCom><vUnCom>62.9000000000</vUnCom><vProd>786.25</vProd>
          <vDesc>6.25</vDesc>
          <cEANTrib>SEM GTIN</cEANTrib><uTrib>KG</uTrib>
          <qTrib>12.5000</qTrib><vUnTrib>62.9000000000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC>
          <vBC>780.00</vBC><pICMS>7.00</pICMS><vICMS>54.60</vICMS>
        </ICMS00></ICMS></imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>1679.00</vBC><vICMS>216.42</vICMS><vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST>
          <vProd>1775.25</vProd><vFrete>45.00</vFrete><vSeg>0.00</vSeg>
          <vDesc>6.25</vDesc><vII>0.00</vII><vIPI>0.00</vIPI>
          <vPIS>11.55</vPIS><vCOFINS>53.19</vCOFINS><vOutro>0.00</vOutro>
          <vNF>1814.00</vNF>
        </ICMSTot>
      </total>
      <transp><modFrete>0</modFrete></transp>
      <pag><detPag><tPag>15</tPag><vPag>1814.00</vPag></detPag></pag>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb><verAplic>SP_NFE_PL009_V4</verAplic>
      <chNFe>${CHAVE_MULTI}</chNFe>
      <dhRecbto>2026-03-12T21:41:12-03:00</dhRecbto>
      <nProt>135260000012345</nProt><digVal>abc123==</digVal>
      <cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`

/**
 * Nota com **um item só**: aqui `det` não é array, é objeto. É o caso que
 * quebra parser ingênuo — a nota some ou vira um item de lixo.
 */
export const CHAVE_UNICA = '35260312345678000195550010000123461112233440'

export const XML_ITEM_UNICO = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE_UNICA}" versao="4.00">
      <ide>
        <cUF>35</cUF><cNF>11223344</cNF><natOp>VENDA</natOp>
        <mod>55</mod><serie>1</serie><nNF>12346</nNF>
        <dhEmi>2026-03-13T02:15:00-03:00</dhEmi>
        <tpNF>1</tpNF><idDest>1</idDest><cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>1</tpAmb>
        <finNFe>1</finNFe><indFinal>0</indFinal><indPres>0</indPres>
        <procEmi>0</procEmi><verProc>4.00</verProc>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <xNome>DISTRIBUIDORA DE BEBIDAS SAO PAULO LTDA</xNome>
        <enderEmit>
          <xLgr>AVENIDA DAS INDUSTRIAS</xLgr><nro>1200</nro>
          <xBairro>DISTRITO INDUSTRIAL</xBairro><cMun>3550308</cMun>
          <xMun>SAO PAULO</xMun><UF>SP</UF><CEP>04711000</CEP>
        </enderEmit>
        <IE>123456789012</IE><CRT>3</CRT>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>3301</cProd><cEAN>7891000100103</cEAN>
          <xProd>OLEO DE SOJA SOYA 900ML CX 20X900ML</xProd>
          <NCM>15071000</NCM><CFOP>5102</CFOP><uCom>CX</uCom>
          <qCom>3.0000</qCom><vUnCom>112.5000000000</vUnCom><vProd>337.50</vProd>
          <indTot>1</indTot>
        </prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC>
          <vBC>337.50</vBC><pICMS>18.00</pICMS><vICMS>60.75</vICMS>
        </ICMS00></ICMS></imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>337.50</vBC><vICMS>60.75</vICMS><vProd>337.50</vProd>
          <vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
          <vOutro>0.00</vOutro><vNF>337.50</vNF>
        </ICMSTot>
      </total>
      <pag><detPag><tPag>01</tPag><vPag>337.50</vPag></detPag></pag>
    </infNFe>
  </NFe>
</nfeProc>`

/**
 * NFe 3.10 antiga: `<NFe>` solto (sem `nfeProc`), com prefixo de namespace e
 * `dEmi` em vez de `dhEmi`. Ainda aparece em arquivo guardado pelo contador.
 */
export const CHAVE_LEGADO = '31251245678901000133550050000009121334455660'

export const XML_LEGADO_DEMI = `<?xml version="1.0" encoding="UTF-8"?>
<nfe:NFe xmlns:nfe="http://www.portalfiscal.inf.br/nfe">
  <nfe:infNFe Id="NFe${CHAVE_LEGADO}" versao="3.10">
    <nfe:ide>
      <nfe:cUF>31</nfe:cUF><nfe:cNF>33445566</nfe:cNF>
      <nfe:natOp>VENDA</nfe:natOp><nfe:mod>55</nfe:mod>
      <nfe:serie>5</nfe:serie><nfe:nNF>912</nfe:nNF>
      <nfe:dEmi>2025-12-20</nfe:dEmi>
      <nfe:tpNF>1</nfe:tpNF><nfe:cDV>0</nfe:cDV><nfe:tpAmb>1</nfe:tpAmb>
    </nfe:ide>
    <nfe:emit>
      <nfe:CNPJ>45678901000133</nfe:CNPJ>
      <nfe:xNome>HORTIFRUTI MINAS LTDA ME</nfe:xNome>
      <nfe:enderEmit>
        <nfe:xLgr>RUA DO MERCADO</nfe:xLgr><nfe:nro>77</nfe:nro>
        <nfe:xBairro>CENTRO</nfe:xBairro><nfe:xMun>BELO HORIZONTE</nfe:xMun>
        <nfe:UF>MG</nfe:UF><nfe:CEP>30110000</nfe:CEP>
      </nfe:enderEmit>
      <nfe:IE>ISENTO</nfe:IE>
    </nfe:emit>
    <nfe:det nItem="1">
      <nfe:prod>
        <nfe:cProd>TOM01</nfe:cProd><nfe:cEAN></nfe:cEAN>
        <nfe:xProd>TOMATE ITALIANO CX 20KG</nfe:xProd>
        <nfe:NCM>07020000</nfe:NCM><nfe:CFOP>5102</nfe:CFOP>
        <nfe:uCom>CX</nfe:uCom><nfe:qCom>4.0000</nfe:qCom>
        <nfe:vUnCom>78.0000000000</nfe:vUnCom><nfe:vProd>312.00</nfe:vProd>
      </nfe:prod>
    </nfe:det>
    <nfe:total>
      <nfe:ICMSTot>
        <nfe:vProd>312.00</nfe:vProd><nfe:vFrete>0.00</nfe:vFrete>
        <nfe:vDesc>0.00</nfe:vDesc><nfe:vOutro>0.00</nfe:vOutro>
        <nfe:vNF>312.00</nfe:vNF>
      </nfe:ICMSTot>
    </nfe:total>
  </nfe:infNFe>
</nfe:NFe>`

/**
 * Soma dos itens (100.06) contra o total declarado (100.00): seis centavos de
 * arredondamento. Nota real faz isso o tempo todo — é aviso, não erro.
 */
export const CHAVE_DIVERGENTE = '35260312345678000195550010000123471223344558'

export const XML_TOTAL_DIVERGENTE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE_DIVERGENTE}" versao="4.00">
      <ide>
        <cUF>35</cUF><cNF>22334455</cNF><mod>55</mod><serie>1</serie>
        <nNF>12347</nNF><dhEmi>2026-03-14T10:00:00-03:00</dhEmi>
        <tpNF>1</tpNF><tpEmis>1</tpEmis><cDV>8</cDV><tpAmb>1</tpAmb>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <xNome>DISTRIBUIDORA DE BEBIDAS SAO PAULO LTDA</xNome>
        <IE>123456789012</IE>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>A1</cProd><cEAN>SEM GTIN</cEAN><xProd>GUARDANAPO PCT C/ 100</xProd>
          <NCM>48181000</NCM><CFOP>5102</CFOP><uCom>PCT</uCom>
          <qCom>7.0000</qCom><vUnCom>7.1500000000</vUnCom><vProd>50.05</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>A2</cProd><cEAN>SEM GTIN</cEAN><xProd>DETERGENTE NEUTRO 500ML</xProd>
          <NCM>34022000</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
          <qCom>7.0000</qCom><vUnCom>7.1500000000</vUnCom><vProd>50.01</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>100.00</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc>
          <vOutro>0.00</vOutro><vNF>100.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`

/** NFC-e (modelo 65): compra de reposição feita no mercado, também é aceita. */
export const CHAVE_NFCE = '41260298765432000110650020000007771556677887'

export const XML_NFCE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE_NFCE}" versao="4.00">
      <ide>
        <cUF>41</cUF><cNF>55667788</cNF><mod>65</mod><serie>2</serie>
        <nNF>777</nNF><dhEmi>2026-02-10T18:22:31-03:00</dhEmi>
        <tpNF>1</tpNF><tpEmis>1</tpEmis><cDV>7</cDV><tpAmb>1</tpAmb>
      </ide>
      <emit>
        <CNPJ>98765432000110</CNPJ><xNome>SUPERMERCADO CURITIBA SA</xNome>
        <IE>9012345678</IE>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>1010</cProd><cEAN>7891910000197</cEAN>
          <xProd>ACUCAR REFINADO UNIAO 1KG</xProd>
          <NCM>17019900</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
          <qCom>6.0000</qCom><vUnCom>5.4900000000</vUnCom><vProd>32.94</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot><vProd>32.94</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc>
          <vOutro>0.00</vOutro><vNF>32.94</vNF></ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`

/** A mesma nota do XML_MULTIPLOS_ITENS com o último dígito da chave trocado. */
export const CHAVE_DV_ERRADO = `${CHAVE_MULTI.slice(0, 43)}8`

export const XML_CHAVE_DV_ERRADO = XML_MULTIPLOS_ITENS.split(CHAVE_MULTI).join(CHAVE_DV_ERRADO)

/** XML de evento de cancelamento: é da SEFAZ, mas não é a nota. */
export const XML_EVENTO_CANCELAMENTO = `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <evento versao="1.00">
    <infEvento Id="ID1101113526031234567800019555001000012345198765432701">
      <cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>12345678000195</CNPJ>
      <chNFe>${CHAVE_MULTI}</chNFe><dhEvento>2026-03-13T09:00:00-03:00</dhEvento>
      <tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento>
      <verEvento>1.00</verEvento>
      <detEvento versao="1.00">
        <descEvento>Cancelamento</descEvento>
        <nProt>135260000012345</nProt>
        <xJust>ERRO DE DIGITACAO NA QUANTIDADE</xJust>
      </detEvento>
    </infEvento>
  </evento>
</procEventoNFe>`

/** Modelo 57 (CT-e disfarçado de NFe): estrutura certa, modelo que não serve. */
export const XML_MODELO_NAO_SUPORTADO = XML_NFCE.replace('<mod>65</mod>', '<mod>57</mod>')

/** Arquivo truncado no meio do download. */
export const XML_MAL_FORMADO = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00"><NFe><infNFe Id="NFe${CHAVE_MULTI}"><ide><mod>55</mod>`
