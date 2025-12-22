import torch
import torch.nn as nn


def create_slowfast_model(num_classes: int, pretrained: bool = True, freeze_backbone: bool = True):
    """
    Loads SlowFast R50 from PyTorchVideo and adapts the classifier
    to your number of classes.
    """
    model = torch.hub.load(
        "facebookresearch/pytorchvideo",
        "slowfast_r50",
        pretrained=pretrained,
    )

    # Replace classification head to match your 8 classes
    # SlowFast head is usually in the last block's `proj` layer
    head = model.blocks[-1]
    in_features = head.proj.in_features
    head.proj = nn.Linear(in_features, num_classes)
    model.blocks[-1] = head

    if freeze_backbone:
        # Freeze all blocks except the last (classification head)
        for block in model.blocks[:-1]:
            for p in block.parameters():
                p.requires_grad = False

    return model


def count_trainable_params(model):
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


if __name__ == "__main__":
    # Quick sanity check
    m = create_slowfast_model(num_classes=8, pretrained=False, freeze_backbone=True)
    print("Trainable params:", count_trainable_params(m))
