from paddleocr import PaddleOCR

ocr = PaddleOCR(
    lang="en",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    enable_mkldnn=False,
) 

result = ocr.predict("handwritten_prescription_2_test.png")

for res in result:
    res.print()
    res.save_to_json("ocr-output")